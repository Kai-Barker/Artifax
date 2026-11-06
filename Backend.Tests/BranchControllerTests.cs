using Artifax.Controllers;
using Artifax.Data;
using Artifax.DTOs;
using Artifax.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Tests
{
    /// <summary>
    /// Tests for BranchController: reads are open, create/rename/delete are admin-only.
    /// </summary>
    public class BranchControllerTests
    {
        private readonly ArtifaxContext _context = TestSupport.NewContext();
        private readonly FakeSession _session = new();
        private readonly BranchController _controller;

        public BranchControllerTests()
        {
            _controller = new BranchController(_context).WithSession(_session);
        }

        private void SeedBranches()
        {
            _context.Branches.AddRange(
                new Branch { BranchID = 1, BranchName = "Main Branch" },
                new Branch { BranchID = 2, BranchName = "Cape Town Components Plant" });
            _context.SaveChanges();
        }

        private void SignInAs(string level) => _session.SetString("UserLevel", level);

        #region Read

        [Fact]
        public async Task GetAll_ReturnsEveryBranch()
        {
            SeedBranches();

            var result = await _controller.GetAll();

            var branches = Assert.IsAssignableFrom<IEnumerable<BranchDto>>(result.Value).ToList();
            Assert.Equal(2, branches.Count);
            Assert.Contains(branches, b => b.BranchID == 2 && b.BranchName == "Cape Town Components Plant");
        }

        [Fact]
        public async Task GetAll_WithNoBranches_ReturnsEmptyList()
        {
            var result = await _controller.GetAll();

            Assert.Empty(Assert.IsAssignableFrom<IEnumerable<BranchDto>>(result.Value));
        }

        [Fact]
        public async Task GetBranchById_WhenFound_ReturnsBranch()
        {
            SeedBranches();

            var result = await _controller.GetBranchById(1);

            var dto = Assert.IsType<BranchDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
            Assert.Equal("Main Branch", dto.BranchName);
        }

        [Fact]
        public async Task GetBranchById_WhenMissing_ReturnsNotFound()
        {
            SeedBranches();

            var result = await _controller.GetBranchById(42);

            Assert.IsType<NotFoundResult>(result.Result);
        }

        #endregion

        #region Create

        [Fact]
        public async Task CreateBranch_AsNonAdmin_ReturnsUnauthorized()
        {
            SignInAs("Employee");

            var result = await _controller.CreateBranch(new BranchDto { BranchName = "Pretoria Plant" });

            Assert.IsType<UnauthorizedObjectResult>(result.Result);
            Assert.Empty(_context.Branches);
        }

        [Fact]
        public async Task CreateBranch_WhenBranchesExist_UsesNextId()
        {
            SeedBranches();
            SignInAs("Admin");

            var result = await _controller.CreateBranch(new BranchDto { BranchName = "Pretoria Plant" });

            var created = Assert.IsType<CreatedAtActionResult>(result.Result);
            var dto = Assert.IsType<BranchDto>(created.Value);
            Assert.Equal(3, dto.BranchID);
            Assert.Equal("Pretoria Plant", _context.Branches.Find(3)!.BranchName);
        }

        [Fact]
        public async Task CreateBranch_WhenNoBranchesExist_CreatesFirstBranch()
        {
            SignInAs("Admin");

            var result = await _controller.CreateBranch(new BranchDto { BranchName = "First Plant" });

            Assert.IsType<CreatedAtActionResult>(result.Result);
            var saved = Assert.Single(_context.Branches);
            Assert.Equal("First Plant", saved.BranchName);
        }

        #endregion

        #region Update

        [Fact]
        public async Task UpdateBranchName_AsNonAdmin_ReturnsUnauthorized()
        {
            SeedBranches();

            var result = await _controller.UpdateBranchName(1, "Renamed");

            Assert.IsType<UnauthorizedObjectResult>(result.Result);
            Assert.Equal("Main Branch", _context.Branches.Find(1)!.BranchName);
        }

        [Fact]
        public async Task UpdateBranchName_WhenMissing_ReturnsNotFound()
        {
            SeedBranches();
            SignInAs("Admin");

            var result = await _controller.UpdateBranchName(42, "Renamed");

            Assert.IsType<NotFoundResult>(result.Result);
        }

        [Fact]
        public async Task UpdateBranchName_AsAdmin_RenamesBranch()
        {
            SeedBranches();
            SignInAs("Admin");

            var result = await _controller.UpdateBranchName(1, "Pretoria Head Office");

            var dto = Assert.IsType<BranchDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
            Assert.Equal("Pretoria Head Office", dto.BranchName);
            Assert.Equal("Pretoria Head Office", _context.Branches.Find(1)!.BranchName);
        }

        #endregion

        #region Delete

        [Fact]
        public async Task DeleteBranch_AsNonAdmin_ReturnsUnauthorized()
        {
            SeedBranches();
            SignInAs("Employee");

            var result = await _controller.DeleteBranch(1);

            Assert.IsType<UnauthorizedObjectResult>(result);
            Assert.Equal(2, _context.Branches.Count());
        }

        [Fact]
        public async Task DeleteBranch_WhenMissing_ReturnsNotFound()
        {
            SeedBranches();
            SignInAs("Admin");

            var result = await _controller.DeleteBranch(42);

            Assert.IsType<NotFoundResult>(result);
        }

        [Fact]
        public async Task DeleteBranch_AsAdmin_RemovesBranch()
        {
            SeedBranches();
            SignInAs("Admin");

            var result = await _controller.DeleteBranch(2);

            Assert.IsType<NoContentResult>(result);
            Assert.Null(_context.Branches.Find(2));
        }

        #endregion
    }
}
