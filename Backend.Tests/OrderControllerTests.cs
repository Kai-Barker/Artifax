using Xunit;
using Microsoft.AspNetCore.Mvc;
using Artifax.Controllers;
using Artifax.Data;
using Artifax.Models;
using Artifax.DTOs;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;

namespace Backend.Tests
{
    public class OrderControllerTests : IDisposable
    {
        private readonly ArtifaxContext _context;
        private readonly OrderController _controller;

        public OrderControllerTests()
        {
            // Create an in-memory database for testing
            var options = new DbContextOptionsBuilder<ArtifaxContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;

            _context = new ArtifaxContext(options);
            _controller = new OrderController(_context);

            // Seed test data
            SeedTestData();
        }

        private void SeedTestData()
        {
            // Add test branches
            var branch1 = new Branch { BranchID = 1, BranchName = "Main Branch" };
            var branch2 = new Branch { BranchID = 2, BranchName = "Secondary Branch" };
            _context.Branches.Add(branch1);
            _context.Branches.Add(branch2);

            // Add test employees
            var employee1 = new Employee
            {
                EmployeeId = 1,
                EmployeeName = "John Doe",
                EmployeeEmail = "john@example.com",
                EmployeePasswordHash = "hash",
                BranchId = 1
            };
            var employee2 = new Employee
            {
                EmployeeId = 2,
                EmployeeName = "Jane Smith",
                EmployeeEmail = "jane@example.com",
                EmployeePasswordHash = "hash",
                BranchId = 1
            };
            _context.Employees.Add(employee1);
            _context.Employees.Add(employee2);

            // Add test items with production times
            var item1 = new Item { ItemID = 1, ItemName = "Chair", ItemCategory = "Furniture", ProductionTime = 15 };
            var item2 = new Item { ItemID = 2, ItemName = "Table", ItemCategory = "Furniture", ProductionTime = 30 };
            var item3 = new Item { ItemID = 3, ItemName = "Desk", ItemCategory = "Furniture", ProductionTime = 45 };
            _context.Items.Add(item1);
            _context.Items.Add(item2);
            _context.Items.Add(item3);

            _context.SaveChanges();
        }

        public void Dispose()
        {
            _context?.Dispose();
        }

        #region GetAllOrders Tests

        [Fact]
        public async Task GetAllOrders_ReturnsOkResult()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            // Act
            var result = await _controller.GetAllOrders();

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var orders = Assert.IsAssignableFrom<IEnumerable<OrderReadDto>>(okResult.Value);
            Assert.NotEmpty(orders);
            var firstOrder = orders.First();
            Assert.Equal(2, firstOrder.Quantity);
            Assert.Equal(30, firstOrder.TotalTime);
        }

        [Fact]
        public async Task GetAllOrders_WithNoOrders_ReturnsEmptyList()
        {
            // Act
            var result = await _controller.GetAllOrders();

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var orders = Assert.IsAssignableFrom<IEnumerable<OrderReadDto>>(okResult.Value);
            Assert.Empty(orders);
        }

        [Fact]
        public async Task GetAllOrders_IncludesAllProductionTrackingFields()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 5,
                Status = "Active",
                CreatedDateTime = DateTime.UtcNow,
                StartedDateTime = DateTime.UtcNow.AddMinutes(-10),
                TotalTime = 75,
                TimeElapsed = 10,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            // Act
            var result = await _controller.GetAllOrders();

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var orders = Assert.IsAssignableFrom<IEnumerable<OrderReadDto>>(okResult.Value);
            var order_dto = orders.First();
            
            Assert.NotNull(order_dto.CreatedDateTime);
            Assert.NotNull(order_dto.StartedDateTime);
            Assert.Equal(5, order_dto.Quantity);
            Assert.Equal(75, order_dto.TotalTime);
            Assert.Equal(10, order_dto.TimeElapsed);
            Assert.Equal("Active", order_dto.Status);
        }

        #endregion

        #region GetOrderById Tests

        [Fact]
        public async Task GetOrderById_WithValidId_ReturnsOkResult()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 3,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 45,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            // Act
            var result = await _controller.GetOrderById(order.OrderID);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var returnedOrder = Assert.IsType<OrderReadDto>(okResult.Value);
            Assert.Equal(order.OrderID, returnedOrder.OrderID);
            Assert.Equal(3, returnedOrder.Quantity);
            Assert.Equal(45, returnedOrder.TotalTime);
        }

        [Fact]
        public async Task GetOrderById_WithInvalidId_ReturnsNotFound()
        {
            // Act
            var result = await _controller.GetOrderById(999);

            // Assert
            Assert.IsType<NotFoundObjectResult>(result);
        }

        [Fact]
        public async Task GetOrderById_ReturnsAllProductionTrackingFields()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 2,
                Quantity = 4,
                Status = "Active",
                CreatedDateTime = DateTime.UtcNow.AddHours(-2),
                StartedDateTime = DateTime.UtcNow.AddHours(-1),
                TotalTime = 120,
                TimeElapsed = 60,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            // Act
            var result = await _controller.GetOrderById(order.OrderID);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var orderDto = Assert.IsType<OrderReadDto>(okResult.Value);
            Assert.Equal(4, orderDto.Quantity);
            Assert.Equal(120, orderDto.TotalTime);
            Assert.Equal(60, orderDto.TimeElapsed);
            Assert.NotNull(orderDto.CreatedDateTime);
            Assert.NotNull(orderDto.StartedDateTime);
            Assert.Null(orderDto.CompletedDateTime);
        }

        #endregion

        #region CreateOrder Tests - Basic

        [Fact]
        public async Task CreateOrder_WithValidData_ReturnsCreatedAtAction()
        {
            // Arrange
            var orderDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 5,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(result);
            Assert.Equal(nameof(OrderController.GetOrderById), createdResult.ActionName);
            var returnedOrder = Assert.IsType<OrderReadDto>(createdResult.Value);
            Assert.Equal(5, returnedOrder.Quantity);
            Assert.Equal("Queued", returnedOrder.Status);
        }

        [Fact]
        public async Task CreateOrder_CalculatesTotalTimeCorrectly()
        {
            // Arrange
            var orderDto = new OrderCreateDto
            {
                ItemID = 1,  // ProductionTime = 15 min
                Quantity = 5,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(result);
            var returnedOrder = Assert.IsType<OrderReadDto>(createdResult.Value);
            Assert.Equal(75, returnedOrder.TotalTime); // 5 * 15 = 75
        }

        [Fact]
        public async Task CreateOrder_SetsCreatedDateTimeToUtcNow()
        {
            // Arrange
            var beforeCreation = DateTime.UtcNow;
            var orderDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 2,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(result);
            var returnedOrder = Assert.IsType<OrderReadDto>(createdResult.Value);
            Assert.True(returnedOrder.CreatedDateTime >= beforeCreation);
            Assert.True(returnedOrder.CreatedDateTime <= DateTime.UtcNow);
        }

        [Fact]
        public async Task CreateOrder_InitializesTimeElapsedToZero()
        {
            // Arrange
            var orderDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 3,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(result);
            var returnedOrder = Assert.IsType<OrderReadDto>(createdResult.Value);
            Assert.Equal(0, returnedOrder.TimeElapsed);
        }

        #endregion

        #region CreateOrder Tests - Validation

        [Fact]
        public async Task CreateOrder_WithInvalidBranch_ReturnsBadRequest()
        {
            // Arrange
            var orderDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 5,
                BranchID = 999,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        [Fact]
        public async Task CreateOrder_WithInvalidItem_ReturnsBadRequest()
        {
            // Arrange
            var orderDto = new OrderCreateDto
            {
                ItemID = 999,
                Quantity = 5,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        [Fact]
        public async Task CreateOrder_WithInvalidEmployee_ReturnsBadRequest()
        {
            // Arrange
            var orderDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 5,
                BranchID = 1,
                EmployeeID = 999,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        #endregion

        #region CreateOrder Tests - Status Rules

        [Fact]
        public async Task CreateOrder_NonExpedited_SetsStatusToQueued()
        {
            // Arrange
            var orderDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 2,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(result);
            var returnedOrder = Assert.IsType<OrderReadDto>(createdResult.Value);
            Assert.Equal("Queued", returnedOrder.Status);
        }

        [Fact]
        public async Task CreateOrder_Expedited_WhenLessThan3Active_SetsStatusToActive()
        {
            // Arrange - Create 2 active orders on branch 1
            for (int i = 0; i < 2; i++)
            {
                _context.Orders.Add(new Order
                {
                    ItemID = 1,
                    Quantity = 1,
                    Status = "Active",
                    CreatedDateTime = DateTime.UtcNow,
                    StartedDateTime = DateTime.UtcNow,
                    TotalTime = 15,
                    TimeElapsed = 0,
                    BranchID = 1,
                    EmployeeID = 1
                });
            }
            _context.SaveChanges();

            var orderDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 2,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = true
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(result);
            var returnedOrder = Assert.IsType<OrderReadDto>(createdResult.Value);
            Assert.Equal("Active", returnedOrder.Status);
            Assert.NotNull(returnedOrder.StartedDateTime);
        }

        [Fact]
        public async Task CreateOrder_Expedited_When3ActiveExists_SetsStatusToQueued()
        {
            // Arrange - Create 3 active orders on branch 1
            for (int i = 0; i < 3; i++)
            {
                _context.Orders.Add(new Order
                {
                    ItemID = 1,
                    Quantity = 1,
                    Status = "Active",
                    CreatedDateTime = DateTime.UtcNow,
                    StartedDateTime = DateTime.UtcNow,
                    TotalTime = 15,
                    TimeElapsed = 0,
                    BranchID = 1,
                    EmployeeID = 1
                });
            }
            _context.SaveChanges();

            var orderDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 2,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = true
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(result);
            var returnedOrder = Assert.IsType<OrderReadDto>(createdResult.Value);
            Assert.Equal("Queued", returnedOrder.Status);
            Assert.Null(returnedOrder.StartedDateTime);
        }

        [Fact]
        public async Task CreateOrder_ConstraintIsPerBranch_NotGlobal()
        {
            // Arrange - Create 3 active orders on branch 1
            for (int i = 0; i < 3; i++)
            {
                _context.Orders.Add(new Order
                {
                    ItemID = 1,
                    Quantity = 1,
                    Status = "Active",
                    CreatedDateTime = DateTime.UtcNow,
                    StartedDateTime = DateTime.UtcNow,
                    TotalTime = 15,
                    TimeElapsed = 0,
                    BranchID = 1,
                    EmployeeID = 1
                });
            }
            _context.SaveChanges();

            // Create expedited order on different branch
            var orderDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 2,
                BranchID = 2,  // Different branch
                EmployeeID = 1,
                OrderExpedite = true
            };

            // Act
            var result = await _controller.CreateOrder(orderDto);

            // Assert - Should be Active since constraint is per-branch
            var createdResult = Assert.IsType<CreatedAtActionResult>(result);
            var returnedOrder = Assert.IsType<OrderReadDto>(createdResult.Value);
            Assert.Equal("Active", returnedOrder.Status);
            Assert.Equal(2, returnedOrder.BranchID);
        }

        #endregion

        #region UpdateOrder Tests

        [Fact]
        public async Task UpdateOrder_WithValidData_ReturnsOkResult()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var updateDto = new OrderCreateDto
            {
                ItemID = 2,  // Different item with ProductionTime = 30
                Quantity = 3,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.UpdateOrder(order.OrderID, updateDto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var updatedOrder = Assert.IsType<OrderReadDto>(okResult.Value);
            Assert.Equal(3, updatedOrder.Quantity);
            Assert.Equal(90, updatedOrder.TotalTime); // 3 * 30 = 90
        }

        [Fact]
        public async Task UpdateOrder_RecalculatesTotalTime()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var updateDto = new OrderCreateDto
            {
                ItemID = 3,  // ProductionTime = 45
                Quantity = 4,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.UpdateOrder(order.OrderID, updateDto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var updatedOrder = Assert.IsType<OrderReadDto>(okResult.Value);
            Assert.Equal(180, updatedOrder.TotalTime); // 4 * 45 = 180
        }

        [Fact]
        public async Task UpdateOrder_WithQueuedStatus_Succeeds()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var updateDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 5,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.UpdateOrder(order.OrderID, updateDto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.NotNull(okResult.Value);
        }

        [Fact]
        public async Task UpdateOrder_WithCompleteStatus_ReturnsBadRequest()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Complete",
                CreatedDateTime = DateTime.UtcNow,
                CompletedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 30,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var updateDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 5,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.UpdateOrder(order.OrderID, updateDto);

            // Assert
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        [Fact]
        public async Task UpdateOrder_WithCancelledStatus_ReturnsBadRequest()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Cancelled",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var updateDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 5,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.UpdateOrder(order.OrderID, updateDto);

            // Assert
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        [Fact]
        public async Task UpdateOrder_WithInvalidId_ReturnsNotFound()
        {
            // Arrange
            var updateDto = new OrderCreateDto
            {
                ItemID = 1,
                Quantity = 5,
                BranchID = 1,
                EmployeeID = 1,
                OrderExpedite = false
            };

            // Act
            var result = await _controller.UpdateOrder(999, updateDto);

            // Assert
            Assert.IsType<NotFoundObjectResult>(result);
        }

        #endregion

        #region UpdateOrderStatus Tests

        [Fact]
        public async Task UpdateOrderStatus_QueuedToActive_Succeeds()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var statusDto = new OrderStatusUpdateDto { Status = "Active", ChangeReason = "Manual activation" };

            // Act
            var result = await _controller.UpdateOrderStatus(order.OrderID, statusDto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.NotNull(okResult.Value);
            
            // Verify in database
            var updatedOrder = _context.Orders.Find(order.OrderID);
            Assert.Equal("Active", updatedOrder.Status);
            Assert.NotNull(updatedOrder.StartedDateTime);
        }

        [Fact]
        public async Task UpdateOrderStatus_ActiveToComplete_SetsCompletedDateTime()
        {
            // Arrange
            var now = DateTime.UtcNow;
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Active",
                CreatedDateTime = now.AddHours(-1),
                StartedDateTime = now.AddMinutes(-30),
                TotalTime = 30,
                TimeElapsed = 30,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var statusDto = new OrderStatusUpdateDto { Status = "Complete", ChangeReason = "Production finished" };

            // Act
            var result = await _controller.UpdateOrderStatus(order.OrderID, statusDto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var updatedOrder = _context.Orders.Find(order.OrderID);
            Assert.Equal("Complete", updatedOrder.Status);
            Assert.NotNull(updatedOrder.CompletedDateTime);
        }

        [Fact]
        public async Task UpdateOrderStatus_ActiveToPaused_Succeeds()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Active",
                CreatedDateTime = DateTime.UtcNow.AddHours(-1),
                StartedDateTime = DateTime.UtcNow.AddMinutes(-30),
                TotalTime = 30,
                TimeElapsed = 15,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var statusDto = new OrderStatusUpdateDto { Status = "Paused", ChangeReason = "Waiting for materials" };

            // Act
            var result = await _controller.UpdateOrderStatus(order.OrderID, statusDto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var updatedOrder = _context.Orders.Find(order.OrderID);
            Assert.Equal("Paused", updatedOrder.Status);
        }

        [Fact]
        public async Task UpdateOrderStatus_PausedBackToActive_Succeeds()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Paused",
                CreatedDateTime = DateTime.UtcNow.AddHours(-2),
                StartedDateTime = DateTime.UtcNow.AddHours(-1),
                TotalTime = 30,
                TimeElapsed = 15,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var statusDto = new OrderStatusUpdateDto { Status = "Active", ChangeReason = "Resuming production" };

            // Act
            var result = await _controller.UpdateOrderStatus(order.OrderID, statusDto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var updatedOrder = _context.Orders.Find(order.OrderID);
            Assert.Equal("Active", updatedOrder.Status);
        }

        [Fact]
        public async Task UpdateOrderStatus_QueuedToCancelled_Succeeds()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var statusDto = new OrderStatusUpdateDto { Status = "Cancelled", ChangeReason = "Customer request" };

            // Act
            var result = await _controller.UpdateOrderStatus(order.OrderID, statusDto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var updatedOrder = _context.Orders.Find(order.OrderID);
            Assert.Equal("Cancelled", updatedOrder.Status);
        }

        [Fact]
        public async Task UpdateOrderStatus_FromCompleteToAnything_ReturnsBadRequest()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Complete",
                CreatedDateTime = DateTime.UtcNow.AddHours(-1),
                StartedDateTime = DateTime.UtcNow.AddMinutes(-30),
                CompletedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 30,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var statusDto = new OrderStatusUpdateDto { Status = "Active", ChangeReason = "Try to reactivate" };

            // Act
            var result = await _controller.UpdateOrderStatus(order.OrderID, statusDto);

            // Assert
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        [Fact]
        public async Task UpdateOrderStatus_FromCancelledToAnything_ReturnsBadRequest()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Cancelled",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var statusDto = new OrderStatusUpdateDto { Status = "Queued", ChangeReason = "Try to reactivate" };

            // Act
            var result = await _controller.UpdateOrderStatus(order.OrderID, statusDto);

            // Assert
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        [Fact]
        public async Task UpdateOrderStatus_WithInvalidStatus_ReturnsBadRequest()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var statusDto = new OrderStatusUpdateDto { Status = "InvalidStatus", ChangeReason = "Invalid test" };

            // Act
            var result = await _controller.UpdateOrderStatus(order.OrderID, statusDto);

            // Assert
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        [Fact]
        public async Task UpdateOrderStatus_With3ActiveLimit_EnforcesConstraint()
        {
            // Arrange - Create 3 active orders
            for (int i = 0; i < 3; i++)
            {
                _context.Orders.Add(new Order
                {
                    ItemID = 1,
                    Quantity = 1,
                    Status = "Active",
                    CreatedDateTime = DateTime.UtcNow,
                    StartedDateTime = DateTime.UtcNow,
                    TotalTime = 15,
                    TimeElapsed = 0,
                    BranchID = 1,
                    EmployeeID = 1
                });
            }
            
            // Create a queued order
            var queuedOrder = new Order
            {
                ItemID = 1,
                Quantity = 1,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 15,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(queuedOrder);
            _context.SaveChanges();

            var statusDto = new OrderStatusUpdateDto { Status = "Active", ChangeReason = "Try to activate" };

            // Act
            var result = await _controller.UpdateOrderStatus(queuedOrder.OrderID, statusDto);

            // Assert - Should fail due to 3-active constraint
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        [Fact]
        public async Task UpdateOrderStatus_LogsToOrderHistory()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var statusDto = new OrderStatusUpdateDto { Status = "Active", ChangeReason = "Scheduled for production" };

            // Act
            var result = await _controller.UpdateOrderStatus(order.OrderID, statusDto);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var histories = _context.OrderHistories.Where(oh => oh.OrderID == order.OrderID).ToList();
            Assert.NotEmpty(histories);
            var lastHistory = histories.Last();
            Assert.Equal("Queued", lastHistory.PreviousStatus);
            Assert.Equal("Active", lastHistory.NewStatus);
            Assert.NotNull(lastHistory.ChangeReason);
        }

        [Fact]
        public async Task UpdateOrderStatus_WithInvalidId_ReturnsNotFound()
        {
            // Arrange
            var statusDto = new OrderStatusUpdateDto { Status = "Active", ChangeReason = "Test" };

            // Act
            var result = await _controller.UpdateOrderStatus(999, statusDto);

            // Assert
            Assert.IsType<NotFoundObjectResult>(result);
        }

        #endregion

        #region DeleteOrder Tests

        [Fact]
        public async Task DeleteOrder_WithValidId_ReturnsNoContent()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            // Act
            var result = await _controller.DeleteOrder(order.OrderID);

            // Assert
            Assert.IsType<NoContentResult>(result);
            var deletedOrder = _context.Orders.FirstOrDefault(o => o.OrderID == order.OrderID);
            Assert.Null(deletedOrder);
        }

        [Fact]
        public async Task DeleteOrder_WithCompleteStatus_ReturnsBadRequest()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Complete",
                CreatedDateTime = DateTime.UtcNow,
                CompletedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 30,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            // Act
            var result = await _controller.DeleteOrder(order.OrderID);

            // Assert
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        [Fact]
        public async Task DeleteOrder_WithCancelledStatus_ReturnsBadRequest()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Cancelled",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            // Act
            var result = await _controller.DeleteOrder(order.OrderID);

            // Assert
            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.NotNull(badRequest.Value);
        }

        [Fact]
        public async Task DeleteOrder_WithInvalidId_ReturnsNotFound()
        {
            // Act
            var result = await _controller.DeleteOrder(999);

            // Assert
            Assert.IsType<NotFoundObjectResult>(result);
        }

        [Fact]
        public async Task DeleteOrder_WithQueuedStatus_Succeeds()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            // Act
            var result = await _controller.DeleteOrder(order.OrderID);

            // Assert
            Assert.IsType<NoContentResult>(result);
        }

        [Fact]
        public async Task DeleteOrder_WithActiveStatus_Succeeds()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Active",
                CreatedDateTime = DateTime.UtcNow,
                StartedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            // Act
            var result = await _controller.DeleteOrder(order.OrderID);

            // Assert
            Assert.IsType<NoContentResult>(result);
        }

        #endregion

        #region Order History Tests

        [Fact]
        public async Task GetAllOrderHistory_ReturnsHistoriesForAllOrders()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Active",
                CreatedDateTime = DateTime.UtcNow,
                StartedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 0,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var history = new OrderHistory
            {
                OrderID = order.OrderID,
                PreviousStatus = "Queued",
                NewStatus = "Active",
                ChangedDateTime = DateTime.UtcNow,
                ChangeReason = "Auto-activated by system"
            };
            _context.OrderHistories.Add(history);
            _context.SaveChanges();

            // Act
            var result = await _controller.GetAllOrderHistory();

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var histories = Assert.IsAssignableFrom<IEnumerable<OrderHistoryReadDto>>(okResult.Value);
            Assert.NotEmpty(histories);
        }

        [Fact]
        public async Task GetOrderHistory_ByOrderId_ReturnsHistoriesForThatOrder()
        {
            // Arrange
            var order = new Order
            {
                ItemID = 1,
                Quantity = 2,
                Status = "Complete",
                CreatedDateTime = DateTime.UtcNow,
                StartedDateTime = DateTime.UtcNow,
                CompletedDateTime = DateTime.UtcNow,
                TotalTime = 30,
                TimeElapsed = 30,
                BranchID = 1,
                EmployeeID = 1
            };
            _context.Orders.Add(order);
            _context.SaveChanges();

            var history1 = new OrderHistory
            {
                OrderID = order.OrderID,
                PreviousStatus = "Queued",
                NewStatus = "Active",
                ChangedDateTime = DateTime.UtcNow.AddMinutes(-5),
                ChangeReason = "Started production"
            };
            var history2 = new OrderHistory
            {
                OrderID = order.OrderID,
                PreviousStatus = "Active",
                NewStatus = "Complete",
                ChangedDateTime = DateTime.UtcNow,
                ChangeReason = "Production finished"
            };
            _context.OrderHistories.Add(history1);
            _context.OrderHistories.Add(history2);
            _context.SaveChanges();

            // Act
            var result = await _controller.GetOrderHistory(order.OrderID);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var histories = Assert.IsAssignableFrom<IEnumerable<OrderHistoryReadDto>>(okResult.Value);
            Assert.Equal(2, histories.Count());
        }

        [Fact]
        public async Task GetOrderHistory_WithInvalidOrderId_ReturnsEmptyList()
        {
            // Act
            var result = await _controller.GetOrderHistory(999);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var histories = Assert.IsAssignableFrom<IEnumerable<OrderHistoryReadDto>>(okResult.Value);
            Assert.Empty(histories);
        }

        #endregion

        #region Queue Order Tests

        private Order AddQueuedOrder(int branchId, int? position)
        {
            var order = new Order
            {
                ItemID = 1,
                Quantity = 1,
                Status = "Queued",
                CreatedDateTime = DateTime.UtcNow,
                TotalTime = 15,
                BranchID = branchId,
                EmployeeID = 1,
                QueuePosition = position
            };
            _context.Orders.Add(order);
            _context.SaveChanges();
            return order;
        }

        [Fact]
        public async Task CreateOrder_Queued_GoesToBackOfBranchQueue()
        {
            AddQueuedOrder(1, 1);
            AddQueuedOrder(1, 2);
            AddQueuedOrder(2, 7); // other branch must not affect branch 1

            var result = await _controller.CreateOrder(new OrderCreateDto { ItemID = 1, Quantity = 1, BranchID = 1, EmployeeID = 1 });

            var created = Assert.IsType<OrderReadDto>(Assert.IsType<CreatedAtActionResult>(result).Value);
            Assert.Equal("Queued", created.Status);
            Assert.Equal(3, created.QueuePosition);
        }

        [Fact]
        public async Task ReorderQueue_SetsPositionsInGivenOrder()
        {
            var a = AddQueuedOrder(1, 1);
            var b = AddQueuedOrder(1, 2);
            var c = AddQueuedOrder(1, 3);

            var result = await _controller.ReorderQueue(1, new QueueReorderDto { OrderIds = new List<int> { c.OrderID, a.OrderID, b.OrderID } });

            Assert.IsType<OkObjectResult>(result);
            Assert.Equal(1, _context.Orders.Find(c.OrderID).QueuePosition);
            Assert.Equal(2, _context.Orders.Find(a.OrderID).QueuePosition);
            Assert.Equal(3, _context.Orders.Find(b.OrderID).QueuePosition);
        }

        [Fact]
        public async Task ReorderQueue_WhenListDoesNotMatchQueue_ReturnsConflict()
        {
            var a = AddQueuedOrder(1, 1);
            AddQueuedOrder(1, 2); // missing from the request, e.g. added by someone else

            var result = await _controller.ReorderQueue(1, new QueueReorderDto { OrderIds = new List<int> { a.OrderID } });

            Assert.IsType<ConflictObjectResult>(result);
            Assert.Equal(1, _context.Orders.Find(a.OrderID).QueuePosition);
        }

        [Fact]
        public async Task ReorderQueue_WithDuplicateIds_ReturnsBadRequest()
        {
            var a = AddQueuedOrder(1, 1);

            var result = await _controller.ReorderQueue(1, new QueueReorderDto { OrderIds = new List<int> { a.OrderID, a.OrderID } });

            Assert.IsType<BadRequestObjectResult>(result);
        }

        [Fact]
        public async Task UpdateOrderStatus_LeavingQueue_ClearsPosition_AndRequeueGoesToBack()
        {
            var a = AddQueuedOrder(1, 1);
            AddQueuedOrder(1, 2);

            await _controller.UpdateOrderStatus(a.OrderID, new OrderStatusUpdateDto { Status = "Paused" });
            Assert.Null(_context.Orders.Find(a.OrderID).QueuePosition);

            await _controller.UpdateOrderStatus(a.OrderID, new OrderStatusUpdateDto { Status = "Queued" });
            Assert.Equal(3, _context.Orders.Find(a.OrderID).QueuePosition);
        }

        #endregion
    }

    // Helper classes for async LINQ operations
    public class TestAsyncQueryProvider<TEntity> : IQueryProvider
    {
        private readonly IQueryProvider _inner;

        internal TestAsyncQueryProvider(IQueryProvider inner)
        {
            _inner = inner;
        }

        public IQueryable CreateQuery(Expression expression)
        {
            return new TestAsyncEnumerable<TEntity>(expression);
        }

        public IQueryable<TElement> CreateQuery<TElement>(Expression expression)
        {
            return new TestAsyncEnumerable<TElement>(expression);
        }

        public object Execute(Expression expression)
        {
            return _inner.Execute(expression);
        }

        public TResult Execute<TResult>(Expression expression)
        {
            return _inner.Execute<TResult>(expression);
        }
    }

    public class TestAsyncEnumerable<T> : EnumerableQuery<T>
    {
        public TestAsyncEnumerable(Expression expression) : base(expression) { }

        public IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken cancellationToken = default)
        {
            return new TestAsyncEnumerator<T>(this.AsEnumerable().GetEnumerator());
        }
    }

    public class TestAsyncEnumerator<T> : IAsyncEnumerator<T>
    {
        private readonly IEnumerator<T> _inner;

        public TestAsyncEnumerator(IEnumerator<T> inner)
        {
            _inner = inner;
        }

        public T Current => _inner.Current;

        public ValueTask<bool> MoveNextAsync()
        {
            return new ValueTask<bool>(_inner.MoveNext());
        }

        public ValueTask DisposeAsync()
        {
            _inner.Dispose();
            return default;
        }
    }
}
