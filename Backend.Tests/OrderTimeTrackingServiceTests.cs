using Artifax.Data;
using Artifax.Models;
using Artifax.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Backend.Tests
{
    /// <summary>
    /// Tests for the background scheduler: ticking active orders, completing them into stock,
    /// and promoting queued orders (by queue position, max 3 active per branch).
    /// Each test gets its own named in-memory database shared between the service's scope and the assertions.
    /// </summary>
    public class OrderTimeTrackingServiceTests
    {
        private sealed class ListLogger : ILogger<OrderTimeTrackingService>
        {
            public List<(LogLevel Level, string Message)> Entries { get; } = new();
            public Action<LogLevel> OnLog { get; set; } = _ => { };
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                Entries.Add((logLevel, formatter(state, exception)));
                OnLog(logLevel);
            }
        }

        /// <summary>Exposes the protected ExecuteAsync loop to the tests.</summary>
        private sealed class RunnableService : OrderTimeTrackingService
        {
            public RunnableService(ILogger<OrderTimeTrackingService> logger, IServiceProvider services) : base(logger, services) { }
            public RunnableService(ILogger<OrderTimeTrackingService> logger, IServiceProvider services, TimeSpan interval) : base(logger, services, interval) { }
            public Task RunAsync(CancellationToken token) => ExecuteAsync(token);
        }

        private readonly string _dbName = Guid.NewGuid().ToString();
        private readonly ServiceProvider _services;
        private readonly ListLogger _logger = new();
        private readonly OrderTimeTrackingService _service;

        public OrderTimeTrackingServiceTests()
        {
            _services = new ServiceCollection()
                .AddDbContext<ArtifaxContext>(o => o.UseInMemoryDatabase(_dbName))
                .BuildServiceProvider();
            _service = new OrderTimeTrackingService(_logger, _services);

            using var db = NewContext();
            db.Branches.AddRange(new Branch { BranchID = 1, BranchName = "Main Branch" }, new Branch { BranchID = 2, BranchName = "Durban Assembly Plant" });
            db.Items.AddRange(
                new Item { ItemID = 1, ItemName = "Steel Workbench", ItemCategory = "Furniture", ProductionTime = 10 },
                new Item { ItemID = 2, ItemName = "Lifting Sling", ItemCategory = "Textile", ProductionTime = 5 });
            db.Employees.Add(new Employee { EmployeeId = 1, EmployeeName = "Wanda Worker", EmployeeEmail = "w@artifax.demo", EmployeePasswordHash = "x", BranchId = 1 });
            db.SaveChanges();
        }

        private ArtifaxContext NewContext() => new(new DbContextOptionsBuilder<ArtifaxContext>().UseInMemoryDatabase(_dbName).Options);

        private int AddOrder(string status, int branchId = 1, int itemId = 1, int qty = 2, int total = 20, int elapsed = 0,
                             bool expedite = false, int? position = null, int minutesAgo = 0)
        {
            using var db = NewContext();
            var order = new Order
            {
                ItemID = itemId, Quantity = qty, Status = status, BranchID = branchId, EmployeeID = 1,
                TotalTime = total, TimeElapsed = elapsed, OrderExpedite = expedite, QueuePosition = position,
                CreatedDateTime = DateTime.UtcNow.AddMinutes(-minutesAgo)
            };
            db.Orders.Add(order);
            db.SaveChanges();
            return order.OrderID;
        }

        private Order GetOrder(int id) { using var db = NewContext(); return db.Orders.Find(id); }

        #region Ticking active orders

        [Fact]
        public async Task ActiveOrder_AdvancesOneMinute()
        {
            int id = AddOrder("Active", elapsed: 5);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            var order = GetOrder(id);
            Assert.Equal(6, order.TimeElapsed);
            Assert.Equal("Active", order.Status);
            Assert.Null(order.CompletedDateTime);
        }

        [Fact]
        public async Task ExpeditedActiveOrder_AdvancesTwoMinutes()
        {
            int id = AddOrder("Active", elapsed: 5, expedite: true);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            Assert.Equal(7, GetOrder(id).TimeElapsed);
        }

        [Fact]
        public async Task QueuedAndPausedOrders_DoNotAdvance()
        {
            // Fill branch 1 so the queued order is not promoted during this cycle.
            AddOrder("Active", total: 100); AddOrder("Active", total: 100); AddOrder("Active", total: 100);
            int queued = AddOrder("Queued", elapsed: 0, position: 1);
            int paused = AddOrder("Paused", elapsed: 4);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            Assert.Equal(0, GetOrder(queued).TimeElapsed);
            Assert.Equal("Queued", GetOrder(queued).Status);
            Assert.Equal(4, GetOrder(paused).TimeElapsed);
        }

        #endregion

        #region Completing orders

        [Fact]
        public async Task OrderReachingTotalTime_Completes_AndAddsToExistingStock()
        {
            using (var db = NewContext())
            {
                db.BranchItemCapacities.Add(new BranchItemCapacity { BranchID = 1, ItemID = 1, ItemQuantity = 10 });
                db.SaveChanges();
            }
            int id = AddOrder("Active", qty: 3, total: 20, elapsed: 19);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            using var check = NewContext();
            var order = check.Orders.Find(id);
            Assert.Equal("Complete", order.Status);
            Assert.NotNull(order.CompletedDateTime);
            Assert.Equal(13, check.BranchItemCapacities.Single(c => c.BranchID == 1 && c.ItemID == 1).ItemQuantity);
            var history = Assert.Single(check.OrderHistories, h => h.OrderID == id);
            Assert.Equal("Active", history.PreviousStatus);
            Assert.Equal("Complete", history.NewStatus);
            Assert.Null(history.ChangedByEmployeeID);
        }

        [Fact]
        public async Task CompletedOrder_WithNoStockRow_CreatesOne()
        {
            int id = AddOrder("Active", branchId: 2, itemId: 2, qty: 4, total: 10, elapsed: 9);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            using var check = NewContext();
            Assert.Equal("Complete", check.Orders.Find(id).Status);
            Assert.Equal(4, check.BranchItemCapacities.Single(c => c.BranchID == 2 && c.ItemID == 2).ItemQuantity);
        }

        [Fact]
        public async Task TwoOrdersOfSameItemCompletingTogether_ShareOneNewStockRow()
        {
            AddOrder("Active", itemId: 2, qty: 4, total: 10, elapsed: 9);
            AddOrder("Active", itemId: 2, qty: 6, total: 10, elapsed: 9);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            using var check = NewContext();
            var row = Assert.Single(check.BranchItemCapacities, c => c.BranchID == 1 && c.ItemID == 2);
            Assert.Equal(10, row.ItemQuantity);
        }

        [Fact]
        public async Task ExpeditedOrder_PassingTotalTime_Completes()
        {
            int id = AddOrder("Active", total: 20, elapsed: 19, expedite: true);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            var order = GetOrder(id);
            Assert.Equal("Complete", order.Status);
            Assert.Equal(21, order.TimeElapsed);
        }

        #endregion

        #region Promoting queued orders

        [Fact]
        public async Task QueuedOrder_IsActivatedOnce_WithOneHistoryEntry()
        {
            int id = AddOrder("Queued", position: 1);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            using var check = NewContext();
            var order = check.Orders.Find(id);
            Assert.Equal("Active", order.Status);
            Assert.NotNull(order.StartedDateTime);
            Assert.Null(order.QueuePosition);
            var history = Assert.Single(check.OrderHistories, h => h.OrderID == id);
            Assert.Equal("Queued", history.PreviousStatus);
            Assert.Equal("Active", history.NewStatus);
        }

        [Fact]
        public async Task QueuedOrders_FillFreeSlots_InQueuePositionOrder()
        {
            AddOrder("Active", total: 100);
            int third = AddOrder("Queued", position: 3, minutesAgo: 30);
            int first = AddOrder("Queued", position: 1, minutesAgo: 10);
            int second = AddOrder("Queued", position: 2, minutesAgo: 20);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            // 1 already active, so only 2 slots: positions 1 and 2 start, position 3 waits.
            Assert.Equal("Active", GetOrder(first).Status);
            Assert.Equal("Active", GetOrder(second).Status);
            Assert.Equal("Queued", GetOrder(third).Status);
            using var check = NewContext();
            Assert.Equal(3, check.Orders.Count(o => o.BranchID == 1 && o.Status == "Active"));
            Assert.Equal(2, check.OrderHistories.Count(h => h.NewStatus == "Active"));
        }

        [Fact]
        public async Task QueuedOrdersWithoutPosition_StartAfterPositioned_OldestFirst()
        {
            AddOrder("Active", total: 100);
            AddOrder("Active", total: 100);
            int newerUnpositioned = AddOrder("Queued", minutesAgo: 5);
            int olderUnpositioned = AddOrder("Queued", minutesAgo: 50);
            AddOrder("Active", branchId: 2, total: 100); // other branch unaffected

            await _service.ProcessOrdersAsync(CancellationToken.None);

            Assert.Equal("Active", GetOrder(olderUnpositioned).Status);
            Assert.Equal("Queued", GetOrder(newerUnpositioned).Status);
        }

        [Fact]
        public async Task PositionedOrder_StartsBeforeOlderUnpositionedOrder()
        {
            AddOrder("Active", total: 100);
            AddOrder("Active", total: 100);
            int unpositioned = AddOrder("Queued", minutesAgo: 60);
            int positioned = AddOrder("Queued", position: 1, minutesAgo: 1);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            Assert.Equal("Active", GetOrder(positioned).Status);
            Assert.Equal("Queued", GetOrder(unpositioned).Status);
        }

        [Fact]
        public async Task BranchAtCapacity_DoesNotPromote()
        {
            AddOrder("Active", total: 100); AddOrder("Active", total: 100); AddOrder("Active", total: 100);
            int queued = AddOrder("Queued", position: 1);

            await _service.ProcessOrdersAsync(CancellationToken.None);

            Assert.Equal("Queued", GetOrder(queued).Status);
            using var check = NewContext();
            Assert.Empty(check.OrderHistories);
        }

        [Fact]
        public async Task BranchWithNothingQueued_IsLeftAlone()
        {
            await _service.ProcessOrdersAsync(CancellationToken.None);

            using var check = NewContext();
            Assert.Empty(check.Orders);
            Assert.Empty(check.OrderHistories);
        }

        #endregion

        #region Background loop

        [Fact]
        public async Task ExecuteAsync_WhenAlreadyCancelled_StopsWithoutProcessing()
        {
            int id = AddOrder("Active", elapsed: 5);
            var service = new RunnableService(_logger, _services);

            await service.RunAsync(new CancellationToken(canceled: true));

            Assert.Equal(5, GetOrder(id).TimeElapsed);
            Assert.Contains(_logger.Entries, e => e.Message == "OrderTimeTrackingService started.");
            Assert.Contains(_logger.Entries, e => e.Message == "OrderTimeTrackingService stopped.");
        }

        [Fact]
        public async Task ExecuteAsync_ProcessesACycle_ThenWaitsUntilCancelled()
        {
            int id = AddOrder("Active", elapsed: 5);
            using var cts = new CancellationTokenSource();
            var service = new RunnableService(_logger, _services);

            var run = service.RunAsync(cts.Token);
            await WaitUntil(() => GetOrder(id).TimeElapsed == 6);
            cts.Cancel();

            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => run);
            Assert.Equal(6, GetOrder(id).TimeElapsed);
            Assert.DoesNotContain(_logger.Entries, e => e.Level == LogLevel.Error);
        }

        [Fact]
        public async Task ExecuteAsync_RunsRepeatedlyAtTheConfiguredInterval()
        {
            int id = AddOrder("Active", total: 100, elapsed: 0);
            using var cts = new CancellationTokenSource();
            var service = new RunnableService(_logger, _services, TimeSpan.FromMilliseconds(10));

            var run = service.RunAsync(cts.Token);
            await WaitUntil(() => GetOrder(id).TimeElapsed >= 3);
            cts.Cancel();

            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => run);
            Assert.True(GetOrder(id).TimeElapsed >= 3);
        }

        [Fact]
        public async Task ExecuteAsync_WhenACycleFails_LogsErrorAndKeepsRunning()
        {
            var brokenServices = new ServiceCollection().BuildServiceProvider(); // no ArtifaxContext registered
            using var cts = new CancellationTokenSource();
            _logger.OnLog = level => { if (level == LogLevel.Error) cts.Cancel(); };
            var service = new RunnableService(_logger, brokenServices);

            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.RunAsync(cts.Token));

            Assert.Contains(_logger.Entries, e => e.Level == LogLevel.Error && e.Message.Contains("Error in OrderTimeTrackingService"));
        }

        private static async Task WaitUntil(Func<bool> condition)
        {
            for (int i = 0; i < 200 && !condition(); i++) await Task.Delay(10);
            Assert.True(condition(), "Condition was not met in time.");
        }

        #endregion
    }
}
