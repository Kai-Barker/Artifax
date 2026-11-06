using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Artifax.Models;
using Artifax.Data;
using Artifax.DTOs;

namespace Artifax.Controllers
{
    /// <summary>
    /// Handles all order-related operations: CRUD and order management with history tracking.
    /// </summary>
    [ApiController]
    [Route("api/[Controller]")]
    public class OrderController : ControllerBase
    {
        readonly ArtifaxContext context;

        public OrderController(ArtifaxContext incoming)
        {
            context = incoming;
        }

        // Position for an order joining the back of a branch's queue.
        private async Task<int> NextQueuePositionAsync(int branchId)
        {
            int? last = await context.Orders
                .Where(o => o.BranchID == branchId && o.Status == "Queued")
                .MaxAsync(o => o.QueuePosition);
            return (last ?? 0) + 1;
        }

        #region GetRoutes

        // GET /api/Order/history/all — Returns history for all orders (must come BEFORE {id} route)
        [HttpGet("history/all")]
        public async Task<IActionResult> GetAllOrderHistory()
        {
            var history = await context.OrderHistories
                .Include(oh => oh.ChangedByEmployee)
                .OrderByDescending(oh => oh.ChangedDateTime)
                .ToListAsync();

            var historyDtos = history.Select(h => new OrderHistoryReadDto
            {
                OrderHistoryID = h.OrderHistoryID,
                OrderID = h.OrderID,
                PreviousStatus = h.PreviousStatus,
                NewStatus = h.NewStatus,
                ChangedDateTime = h.ChangedDateTime,
                ChangedByEmployeeID = h.ChangedByEmployeeID,
                ChangedByEmployeeName = h.ChangedByEmployee?.EmployeeName ?? "System",
                ChangeReason = h.ChangeReason
            }).ToList();

            return Ok(historyDtos);
        }

        // GET /api/Order — Returns all orders with their items and branch info
        [HttpGet]
        public async Task<IActionResult> GetAllOrders()
        {
            var orders = await context.Orders
                .Include(o => o.Item)
                .Include(o => o.Branch)
                .ToListAsync();

            var orderDtos = orders.Select(o => new OrderReadDto
            {
                OrderID = o.OrderID,
                ItemID = o.ItemID,
                ItemName = o.Item.ItemName ?? "Unknown", // Item is a required, included relation
                Quantity = o.Quantity,
                CreatedDateTime = o.CreatedDateTime,
                StartedDateTime = o.StartedDateTime,
                CompletedDateTime = o.CompletedDateTime,
                TotalTime = o.TotalTime,
                TimeElapsed = o.TimeElapsed,
                Status = o.Status,
                BranchID = o.BranchID,
                EmployeeID = o.EmployeeID,
                OrderExpedite = o.OrderExpedite,
                QueuePosition = o.QueuePosition
            }).ToList();

            return Ok(orderDtos);
        }

        // GET /api/Order/{id}/history — Returns the complete history of status changes for an order (must come BEFORE {id} route)
        [HttpGet("{id}/history")]
        public async Task<IActionResult> GetOrderHistory(int id)
        {
            // Note: We don't check if order exists - return history regardless (empty if order doesn't exist)
            var history = await context.OrderHistories
                .Where(oh => oh.OrderID == id)
                .Include(oh => oh.ChangedByEmployee)
                .OrderByDescending(oh => oh.ChangedDateTime)
                .ToListAsync();

            var historyDtos = history.Select(h => new OrderHistoryReadDto
            {
                OrderHistoryID = h.OrderHistoryID,
                OrderID = h.OrderID,
                PreviousStatus = h.PreviousStatus,
                NewStatus = h.NewStatus,
                ChangedDateTime = h.ChangedDateTime,
                ChangedByEmployeeID = h.ChangedByEmployeeID,
                ChangedByEmployeeName = h.ChangedByEmployee?.EmployeeName ?? "System",
                ChangeReason = h.ChangeReason
            }).ToList();

            return Ok(historyDtos);
        }

        // GET /api/Order/{id} — Returns a single order by ID with items and branch
        [HttpGet("{id}")]
        public async Task<IActionResult> GetOrderById(int id)
        {
            var order = await context.Orders
                .Include(o => o.Item)
                .Include(o => o.Branch)
                .FirstOrDefaultAsync(o => o.OrderID == id);

            if (order == null)
                return NotFound($"Order with ID {id} not found.");

            var orderDto = new OrderReadDto
            {
                OrderID = order.OrderID,
                ItemID = order.ItemID,
                ItemName = order.Item.ItemName ?? "Unknown", // Item is a required, included relation
                Quantity = order.Quantity,
                CreatedDateTime = order.CreatedDateTime,
                StartedDateTime = order.StartedDateTime,
                CompletedDateTime = order.CompletedDateTime,
                TotalTime = order.TotalTime,
                TimeElapsed = order.TimeElapsed,
                Status = order.Status,
                BranchID = order.BranchID,
                EmployeeID = order.EmployeeID,
                OrderExpedite = order.OrderExpedite,
                QueuePosition = order.QueuePosition
            };

            return Ok(orderDto);
        }

        #endregion

        #region CreateRoutes

        // POST /api/Order/create — Creates a new order with a single item
        // Request body: { itemID, quantity, branchID, employeeID, orderExpedite }
        [HttpPost("create")]
        public async Task<IActionResult> CreateOrder([FromBody] OrderCreateDto newOrderDto)
        {
            // Validate that the item exists in the database
            var item = await context.Items.FindAsync(newOrderDto.ItemID);
            if (item == null)
                return BadRequest($"Item with ID {newOrderDto.ItemID} does not exist.");

            // Validate that the branch exists in the database
            var branch = await context.Branches.FindAsync(newOrderDto.BranchID);
            if (branch == null)
                return BadRequest($"Branch with ID {newOrderDto.BranchID} does not exist.");

            // Validate that the employee exists in the database
            var employee = await context.Employees.FindAsync(newOrderDto.EmployeeID);
            if (employee == null)
                return BadRequest($"Employee with ID {newOrderDto.EmployeeID} does not exist.");

            // Calculate total production time
            int totalTime = newOrderDto.Quantity * item.ProductionTime;

            // Check if this branch already has 3 active orders
            int activeOrderCount = await context.Orders
                .Where(o => o.BranchID == newOrderDto.BranchID && o.Status == "Active")
                .CountAsync();

            string initialStatus = (activeOrderCount < 3 && newOrderDto.OrderExpedite) 
                ? "Active" 
                : "Queued";

            DateTime? startedDateTime = initialStatus == "Active" ? DateTime.UtcNow : null;

            // Create the order
            var newOrder = new Order
            {
                ItemID = newOrderDto.ItemID,
                Quantity = newOrderDto.Quantity,
                BranchID = newOrderDto.BranchID,
                EmployeeID = newOrderDto.EmployeeID,
                OrderExpedite = newOrderDto.OrderExpedite,
                Status = initialStatus,
                QueuePosition = initialStatus == "Queued" ? await NextQueuePositionAsync(newOrderDto.BranchID) : null,
                CreatedDateTime = DateTime.UtcNow,
                StartedDateTime = startedDateTime,
                TotalTime = totalTime,
                TimeElapsed = 0
            };

            context.Orders.Add(newOrder);
            await context.SaveChangesAsync();

            // Reload and return the created order
            var created = await context.Orders
                .Include(o => o.Item)
                .Include(o => o.Branch)
                .FirstOrDefaultAsync(o => o.OrderID == newOrder.OrderID);

            var createdDto = new OrderReadDto
            {
                OrderID = created.OrderID,
                ItemID = created.ItemID,
                ItemName = item.ItemName ?? "Unknown",
                Quantity = created.Quantity,
                CreatedDateTime = created.CreatedDateTime,
                StartedDateTime = created.StartedDateTime,
                CompletedDateTime = created.CompletedDateTime,
                TotalTime = created.TotalTime,
                TimeElapsed = created.TimeElapsed,
                Status = created.Status,
                BranchID = created.BranchID,
                EmployeeID = created.EmployeeID,
                OrderExpedite = created.OrderExpedite,
                QueuePosition = created.QueuePosition
            };

            return CreatedAtAction(nameof(GetOrderById), new { id = newOrder.OrderID }, createdDto);
        }

        #endregion

        #region UpdateRoutes

        // PUT /api/Order/{id} — Updates an existing order (cannot update if already completed)
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateOrder(int id, [FromBody] OrderCreateDto updatedOrderDto)
        {
            var existingOrder = await context.Orders
                .Include(o => o.Item)
                .FirstOrDefaultAsync(o => o.OrderID == id);

            if (existingOrder == null)
                return NotFound($"Order with ID {id} not found.");

            // Prevent updates to completed or cancelled orders
            if (existingOrder.Status == "Complete" || existingOrder.Status == "Cancelled")
                return BadRequest($"Cannot update an order with status '{existingOrder.Status}'.");

            // Validate the item exists
            var item = await context.Items.FindAsync(updatedOrderDto.ItemID);
            if (item == null)
                return BadRequest($"Item with ID {updatedOrderDto.ItemID} does not exist.");

            // Validate the branch exists
            var branch = await context.Branches.FindAsync(updatedOrderDto.BranchID);
            if (branch == null)
                return BadRequest($"Branch with ID {updatedOrderDto.BranchID} does not exist.");

            // Validate the employee exists
            var employee = await context.Employees.FindAsync(updatedOrderDto.EmployeeID);
            if (employee == null)
                return BadRequest($"Employee with ID {updatedOrderDto.EmployeeID} does not exist.");

            // A queued order moved to another branch joins the back of that branch's queue
            if (existingOrder.Status == "Queued" && existingOrder.BranchID != updatedOrderDto.BranchID)
            {
                existingOrder.QueuePosition = await NextQueuePositionAsync(updatedOrderDto.BranchID);
            }

            // Update fields
            existingOrder.ItemID = updatedOrderDto.ItemID;
            existingOrder.Quantity = updatedOrderDto.Quantity;
            existingOrder.BranchID = updatedOrderDto.BranchID;
            existingOrder.EmployeeID = updatedOrderDto.EmployeeID;
            existingOrder.OrderExpedite = updatedOrderDto.OrderExpedite;

            // Recalculate TotalTime in case the Item or Quantity changed (item was validated above)
            existingOrder.TotalTime = updatedOrderDto.Quantity * item.ProductionTime;

            await context.SaveChangesAsync();

            // Reload with includes for response
            var result = await context.Orders
                .Include(o => o.Item)
                .Include(o => o.Branch)
                .FirstOrDefaultAsync(o => o.OrderID == id);

            var resultDto = new OrderReadDto
            {
                OrderID = result.OrderID,
                ItemID = result.ItemID,
                ItemName = item.ItemName ?? "Unknown",
                Quantity = result.Quantity,
                CreatedDateTime = result.CreatedDateTime,
                StartedDateTime = result.StartedDateTime,
                CompletedDateTime = result.CompletedDateTime,
                TotalTime = result.TotalTime,
                TimeElapsed = result.TimeElapsed,
                Status = result.Status,
                BranchID = result.BranchID,
                EmployeeID = result.EmployeeID,
                OrderExpedite = result.OrderExpedite,
                QueuePosition = result.QueuePosition
            };

            return Ok(resultDto);
        }

        // PUT /api/Order/{id}/status — Update order status with validation and constraints
        [HttpPut("{id}/status")]
        public async Task<IActionResult> UpdateOrderStatus(int id, [FromBody] OrderStatusUpdateDto statusDto)
        {
            var order = await context.Orders.FindAsync(id);
            if (order == null)
                return NotFound($"Order with ID {id} not found.");

            // Validate status value
            var validStatuses = new[] { "Queued", "Active", "Paused", "Cancelled", "Complete" };
            if (!validStatuses.Contains(statusDto.Status))
                return BadRequest($"Invalid status '{statusDto.Status}'. Valid statuses are: Queued, Active, Paused, Cancelled, Complete.");

            string previousStatus = order.Status;

            // Prevent transitions from Complete or Cancelled
            if (previousStatus == "Complete" || previousStatus == "Cancelled")
                return BadRequest($"Cannot transition from '{previousStatus}' status.");

            // Check 3-active constraint when transitioning to Active
            if (statusDto.Status == "Active" && previousStatus != "Active")
            {
                int activeOrderCount = await context.Orders
                    .Where(o => o.BranchID == order.BranchID && o.Status == "Active")
                    .CountAsync();

                if (activeOrderCount >= 3)
                    return BadRequest($"Cannot activate order. Branch {order.BranchID} already has 3 active orders.");
            }

            // Set StartedDateTime when transitioning to Active
            if (statusDto.Status == "Active" && previousStatus != "Active")
            {
                order.StartedDateTime = DateTime.UtcNow;
            }

            // Set CompletedDateTime when transitioning to Complete
            if (statusDto.Status == "Complete")
            {
                order.CompletedDateTime = DateTime.UtcNow;
            }

            // Queue position only applies while queued; re-queued orders go to the back
            if (statusDto.Status == "Queued" && previousStatus != "Queued")
            {
                order.QueuePosition = await NextQueuePositionAsync(order.BranchID);
            }
            else if (statusDto.Status != "Queued")
            {
                order.QueuePosition = null;
            }

            order.Status = statusDto.Status;

            // Create history entry
            var history = new OrderHistory
            {
                OrderID = id,
                PreviousStatus = previousStatus,
                NewStatus = statusDto.Status,
                ChangedDateTime = DateTime.UtcNow,
                ChangedByEmployeeID = statusDto.ChangedByEmployeeID,
                ChangeReason = statusDto.ChangeReason
            };

            context.OrderHistories.Add(history);
            await context.SaveChangesAsync();

            return Ok(new { message = "Order status updated successfully." });
        }

        // PUT /api/Order/branch/{branchId}/queue — Sets the start order of a branch's queued orders.
        // Body: { orderIds: [...] } listing every queued order in the branch, first-to-start first.
        // Returns 409 if the list doesn't match the branch's current queue (e.g. an order started meanwhile).
        [HttpPut("branch/{branchId:int}/queue")]
        public async Task<IActionResult> ReorderQueue(int branchId, [FromBody] QueueReorderDto reorderDto)
        {
            if (reorderDto?.OrderIds == null || reorderDto.OrderIds.Count == 0)
                return BadRequest("orderIds must list the branch's queued orders.");

            if (reorderDto.OrderIds.Distinct().Count() != reorderDto.OrderIds.Count)
                return BadRequest("orderIds contains duplicates.");

            var queuedOrders = await context.Orders
                .Where(o => o.BranchID == branchId && o.Status == "Queued")
                .ToListAsync();

            if (!queuedOrders.Select(o => o.OrderID).ToHashSet().SetEquals(reorderDto.OrderIds))
                return Conflict("The queue has changed since it was loaded. Refresh and try again.");

            var ordersById = queuedOrders.ToDictionary(o => o.OrderID);
            for (int i = 0; i < reorderDto.OrderIds.Count; i++)
            {
                ordersById[reorderDto.OrderIds[i]].QueuePosition = i + 1;
            }

            await context.SaveChangesAsync();

            return Ok(reorderDto.OrderIds.Select((id, i) => new { orderID = id, queuePosition = i + 1 }));
        }

        #endregion

        #region DeleteRoutes

        // DELETE /api/Order/{id} — Deletes an order
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteOrder(int id)
        {
            var order = await context.Orders.FindAsync(id);

            if (order == null)
                return NotFound($"Order with ID {id} not found.");

            // Prevent deletion of completed or cancelled orders
            if (order.Status == "Complete" || order.Status == "Cancelled")
                return BadRequest($"Cannot delete an order with status '{order.Status}'.");

            context.Orders.Remove(order);
            await context.SaveChangesAsync();

            return NoContent();
        }

        #endregion
    }
}