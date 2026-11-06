using Artifax.Controllers;
using Artifax.Data;
using Artifax.DTOs;
using Artifax.Models;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Tests
{
    /// <summary>
    /// ItemController endpoints not covered by ItemControllerTests: item creation with default
    /// stock rows, inventory listing, item ingredients, and branch quantity updates.
    /// </summary>
    public class ItemControllerEndpointTests
    {
        private readonly ArtifaxContext _context = TestSupport.NewContext();
        private readonly ItemController _controller;

        public ItemControllerEndpointTests()
        {
            _context.Branches.AddRange(
                new Branch { BranchID = 1, BranchName = "Main Branch" },
                new Branch { BranchID = 2, BranchName = "Durban Assembly Plant" });
            _context.Items.AddRange(
                new Item { ItemID = 1, ItemName = "Steel Sheet 2mm", ItemCategory = "Metals", ProductionTime = 3, Price = 450f },
                new Item { ItemID = 2, ItemName = "Hex Bolt M10", ItemCategory = "Fasteners", ProductionTime = 1, Price = 2.5f },
                new Item { ItemID = 3, ItemName = "Steel Workbench", ItemCategory = "Furniture", ProductionTime = 45, Price = 8900f });
            _context.ItemIngredients.AddRange(
                new ItemIngredient { ItemIngredientID = 1, ProductID = 3, IngredientID = 1, IngredientQuantity = 2 },
                new ItemIngredient { ItemIngredientID = 2, ProductID = 3, IngredientID = 2, IngredientQuantity = 16 });
            _context.BranchItemCapacities.AddRange(
                new BranchItemCapacity { BranchItemCapacityID = 1, BranchID = 1, ItemID = 1, ItemQuantity = 140 },
                new BranchItemCapacity { BranchItemCapacityID = 2, BranchID = 2, ItemID = 1, ItemQuantity = 4 });
            _context.SaveChanges();

            _controller = new ItemController(_context);
        }

        private static ItemWriteDto NewItem() => new()
        {
            ItemName = "Pallet Rack Frame",
            ItemCategory = "Metals",
            ProductionTime = 50,
            Price = 7300f
        };

        #region Create with default quantities

        [Fact]
        public async Task CreateItemAndBranches_CreatesItemWithZeroStockAtEveryBranch()
        {
            var result = await _controller.CreateItemAndBranches(NewItem());

            var created = Assert.IsType<CreatedAtActionResult>(result.Result);
            var dto = Assert.IsType<ItemReadDto>(created.Value);
            Assert.Equal("Pallet Rack Frame", dto.ItemName);
            Assert.Equal(7300f, dto.Price);

            var stock = _context.BranchItemCapacities.Where(c => c.ItemID == dto.ItemID).ToList();
            Assert.Equal(2, stock.Count);
            Assert.All(stock, row => Assert.Equal(0, row.ItemQuantity));
            Assert.Equal(new[] { 1, 2 }, stock.Select(s => s.BranchID).OrderBy(id => id));
        }

        [Fact]
        public async Task CreateItemAndBranches_WithNoBranches_CreatesItemOnly()
        {
            _context.Branches.RemoveRange(_context.Branches);
            _context.SaveChanges();

            var result = await _controller.CreateItemAndBranches(NewItem());

            var dto = Assert.IsType<ItemReadDto>(Assert.IsType<CreatedAtActionResult>(result.Result).Value);
            Assert.NotNull(_context.Items.Find(dto.ItemID));
            Assert.DoesNotContain(_context.BranchItemCapacities, c => c.ItemID == dto.ItemID);
        }

        #endregion

        #region Update item

        [Fact]
        public async Task UpdateItem_WhenMissing_ReturnsNotFound()
        {
            var result = await _controller.UpdateItem(99, NewItem());

            Assert.IsType<NotFoundResult>(result);
        }

        #endregion

        #region Inventory listing

        [Fact]
        public async Task GetAllInventoryItems_ReturnsOneRowPerItemPerBranch()
        {
            var result = await _controller.GetAllInventoryItems();

            var rows = Assert.IsAssignableFrom<IEnumerable<InventoryItemReadDto>>(result.Value).ToList();
            Assert.Equal(2, rows.Count);

            var durban = Assert.Single(rows, r => r.InventoryItemBranchId == 2);
            Assert.Equal(1, durban.InventoryItemId);
            Assert.Equal("Steel Sheet 2mm", durban.InventoryItemName);
            Assert.Equal("Metals", durban.InventoryItemCategory);
            Assert.Equal(3, durban.InventoryItemProductionTime);
            Assert.Equal(4, durban.InventoryItemQuantity);
            Assert.Equal(450f, durban.InventoryItemPrice);
            Assert.Equal("Durban Assembly Plant", durban.InventoryItemBranchName);
        }

        [Fact]
        public async Task GetAllInventoryItems_WithNoStockRows_ReturnsEmpty()
        {
            _context.BranchItemCapacities.RemoveRange(_context.BranchItemCapacities);
            _context.SaveChanges();

            var result = await _controller.GetAllInventoryItems();

            Assert.Empty(Assert.IsAssignableFrom<IEnumerable<InventoryItemReadDto>>(result.Value));
        }

        #endregion

        #region Item ingredients

        [Fact]
        public async Task GetAllItemIngredients_ReturnsEveryIngredientRow()
        {
            var result = await _controller.GetAllItemIngredients();

            var rows = Assert.IsAssignableFrom<IEnumerable<ItemIngredientReadDto>>(result.Value).ToList();
            Assert.Equal(2, rows.Count);
            Assert.Contains(rows, r => r.ProductID == 3 && r.IngredientID == 2 && r.IngredientQuantity == 16);
        }

        [Fact]
        public async Task GetIngredientsForItem_WithBlueprint_ReturnsIngredientDetails()
        {
            var result = await _controller.GetIngredientsForItem(3);

            var blueprint = Assert.IsAssignableFrom<IEnumerable<IngredientBlueprintReadDto>>(result.Value).ToList();
            Assert.Equal(2, blueprint.Count);
            var bolt = Assert.Single(blueprint, b => b.IngredientID == 2);
            Assert.Equal("Hex Bolt M10", bolt.ItemName);
            Assert.Equal("Fasteners", bolt.ItemCategory);
            Assert.Equal(2.5f, bolt.ItemPrice);
            Assert.Equal(16, bolt.Quantity);
        }

        [Fact]
        public async Task GetIngredientsForItem_WithoutBlueprint_ReturnsNotFound()
        {
            var result = await _controller.GetIngredientsForItem(1);

            Assert.IsType<NotFoundResult>(result.Result);
        }

        [Fact]
        public async Task UpdateItemIngredient_WhenMissing_ReturnsNotFound()
        {
            var result = await _controller.UpdateItemIngredient(99, new ItemIngredientWriteDto { ProductID = 3, IngredientID = 1, IngredientQuantity = 5 });

            Assert.IsType<NotFoundResult>(result);
        }

        #endregion

        #region Branch stock quantity

        [Fact]
        public async Task UpdateBranchItemCapacityQuantity_ChangesOnlyQuantity()
        {
            var result = await _controller.UpdateBranchItemCapacityQuantity(2, new BranchItemCapacityWriteDto { BranchID = 1, ItemID = 2, ItemQuantity = 25 });

            Assert.IsType<NoContentResult>(result);
            var row = _context.BranchItemCapacities.Find(2)!;
            Assert.Equal(25, row.ItemQuantity);
            Assert.Equal(2, row.BranchID);
            Assert.Equal(1, row.ItemID);
        }

        [Fact]
        public async Task UpdateBranchItemCapacityQuantity_WhenMissing_ReturnsNotFound()
        {
            var result = await _controller.UpdateBranchItemCapacityQuantity(99, new BranchItemCapacityWriteDto { ItemQuantity = 25 });

            Assert.IsType<NotFoundResult>(result);
        }

        #endregion
    }
}
