using Artifax.Controllers;
using Artifax.Data;
using Artifax.DTOs;
using Artifax.Models;
using Google.Authenticator;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests
{
    /// <summary>
    /// Tests for UserController: listing, login + 2FA, session, and admin-only employee management.
    /// Uses an in-memory database with mock employees and a fake session per test.
    /// </summary>
    public class UserControllerTests
    {
        private const string Password = "Secret123!";

        private readonly ArtifaxContext _context;
        private readonly UserController _controller;
        private readonly FakeSession _session = new();

        public UserControllerTests()
        {
            _context = TestSupport.NewContext();

            _context.Branches.AddRange(
                new Branch { BranchID = 1, BranchName = "Main Branch" },
                new Branch { BranchID = 2, BranchName = "Durban Assembly Plant" });

            string hash = BCrypt.Net.BCrypt.HashPassword(Password, 4);
            _context.Employees.AddRange(
                new Employee { EmployeeId = 1, EmployeeEmail = "worker@artifax.demo", EmployeeName = "Wanda Worker", EmployeePasswordHash = hash, EmployeeLevel = "Employee", BranchId = 1 },
                new Employee { EmployeeId = 2, EmployeeEmail = "worker2@artifax.demo", EmployeeName = "Will Worker", EmployeePasswordHash = hash, EmployeeLevel = "Employee", BranchId = 2 },
                new Employee { EmployeeId = 3, EmployeeEmail = "admin@artifax.demo", EmployeeName = "Ada Admin", EmployeePasswordHash = hash, EmployeeLevel = "Admin", BranchId = 1, TwoFactorSecret = "EXISTINGSECRET1234567890" });
            _context.SaveChanges();

            _controller = new UserController(_context).WithSession(_session);
        }

        private void SignInAs(string level) => _session.SetString("UserLevel", level);

        private static EmployeeWriteDto NewEmployee(string email = "new@artifax.demo", string password = "NewPass1!") => new()
        {
            BranchID = 2,
            EmployeeEmail = email,
            EmployeeName = "Nina New",
            EmployeePassword = password,
            EmployeeLevel = "Employee"
        };

        #region Listing

        [Fact]
        public async Task GetAllUsers_ReturnsEveryEmployee()
        {
            var result = await _controller.GetAllUsers();

            var users = Assert.IsAssignableFrom<IEnumerable<EmployeeReadDto>>(result.Value).ToList();
            Assert.Equal(3, users.Count);
            Assert.Contains(users, u => u.EmployeeName == "Ada Admin" && u.EmployeeLevel == "Admin");
        }

        [Fact]
        public async Task GetAllEmployees_ReturnsOnlyEmployeeLevel()
        {
            var result = await _controller.GetAllEmployees();

            var users = Assert.IsAssignableFrom<IEnumerable<EmployeeReadDto>>(result.Value).ToList();
            Assert.Equal(2, users.Count);
            Assert.All(users, u => Assert.Equal("Employee", u.EmployeeLevel));
        }

        [Fact]
        public async Task GetAllAdmins_ReturnsOnlyAdmins()
        {
            var result = await _controller.GetAllAdmins();

            var admins = Assert.IsAssignableFrom<IEnumerable<EmployeeReadDto>>(result.Value).ToList();
            var admin = Assert.Single(admins);
            Assert.Equal("admin@artifax.demo", admin.EmployeeEmail);
        }

        [Fact]
        public async Task GetEmployeeByEmail_WhenFound_ReturnsEmployee()
        {
            var result = await _controller.GetEmployeeByEmail("worker@artifax.demo");

            var dto = Assert.IsType<EmployeeReadDto>(result.Value);
            Assert.Equal(1, dto.EmployeeId);
            Assert.Equal("Wanda Worker", dto.EmployeeName);
            Assert.Equal(1, dto.BranchId);
        }

        [Fact]
        public async Task GetEmployeeByEmail_WhenMissing_ReturnsNotFound()
        {
            var result = await _controller.GetEmployeeByEmail("nobody@artifax.demo");

            Assert.IsType<NotFoundResult>(result.Result);
        }

        #endregion

        #region Session (/me)

        [Fact]
        public void GetCurrentUser_WithNoSession_ReturnsUnauthorized()
        {
            var result = _controller.GetCurrentUser();

            Assert.IsType<UnauthorizedObjectResult>(result);
        }

        [Fact]
        public void GetCurrentUser_WithSession_ReturnsSessionDetails()
        {
            _session.SetString("UserLevel", "Admin");
            _session.SetString("UserEmail", "admin@artifax.demo");
            _session.SetString("Username", "Ada Admin");

            var result = _controller.GetCurrentUser();

            var dto = Assert.IsType<CurrentUserDto>(Assert.IsType<OkObjectResult>(result).Value);
            Assert.Equal("Admin", dto.UserLevel);
            Assert.Equal("admin@artifax.demo", dto.UserEmail);
            Assert.Equal("Ada Admin", dto.Username);
        }

        #endregion

        #region Login + 2FA

        [Fact]
        public async Task Login_WhenEmailUnknown_ReturnsUnauthorized()
        {
            var result = await _controller.LoginEmployee(new LoginDto { Email = "nobody@artifax.demo", Password = Password });

            Assert.IsType<UnauthorizedObjectResult>(result.Result);
            Assert.Null(_session.GetString("Pending2FAEmail"));
        }

        [Fact]
        public async Task Login_WhenPasswordWrong_ReturnsUnauthorized()
        {
            var result = await _controller.LoginEmployee(new LoginDto { Email = "worker@artifax.demo", Password = "wrong" });

            Assert.IsType<UnauthorizedObjectResult>(result.Result);
            Assert.Null(_session.GetString("Pending2FAEmail"));
        }

        [Fact]
        public async Task Login_FirstTime_CreatesTwoFactorSecret_AndStartsPendingSession()
        {
            var result = await _controller.LoginEmployee(new LoginDto { Email = "worker@artifax.demo", Password = Password });

            Assert.IsType<OkObjectResult>(result.Result);
            Assert.Equal("worker@artifax.demo", _session.GetString("Pending2FAEmail"));
            var secret = _context.Employees.Single(e => e.EmployeeId == 1).TwoFactorSecret;
            Assert.False(string.IsNullOrEmpty(secret));
            Assert.Equal(32, secret.Length);
        }

        [Fact]
        public async Task Login_WhenSecretAlreadySet_KeepsExistingSecret()
        {
            var result = await _controller.LoginEmployee(new LoginDto { Email = "admin@artifax.demo", Password = Password });

            Assert.IsType<OkObjectResult>(result.Result);
            Assert.Equal("EXISTINGSECRET1234567890", _context.Employees.Single(e => e.EmployeeId == 3).TwoFactorSecret);
        }

        [Fact]
        public async Task Get2FaSetupUri_WithoutPendingLogin_ReturnsUnauthorized()
        {
            var result = await _controller.Get2FaSetupUri();

            Assert.IsType<UnauthorizedObjectResult>(result);
        }

        [Fact]
        public async Task Get2FaSetupUri_WithPendingLogin_ReturnsOtpAuthUri()
        {
            _session.SetString("Pending2FAEmail", "admin@artifax.demo");

            var result = await _controller.Get2FaSetupUri();

            var value = Assert.IsType<OkObjectResult>(result).Value!;
            string uri = (string)value.GetType().GetProperty("qrCodeUri")!.GetValue(value)!;
            string secret = (string)value.GetType().GetProperty("rawSecret")!.GetValue(value)!;
            Assert.StartsWith("otpauth://totp/ArtifaxApp:admin%40artifax.demo?secret=", uri);
            Assert.Contains($"secret={secret}", uri);
        }

        [Fact]
        public async Task Verify2Fa_WithoutCode_ReturnsBadRequest()
        {
            var result = await _controller.Verify2Fa(new Dictionary<string, string>());

            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Fact]
        public async Task Verify2Fa_WithoutPendingLogin_ReturnsUnauthorized()
        {
            var result = await _controller.Verify2Fa(new Dictionary<string, string> { ["code"] = "123456" });

            Assert.IsType<UnauthorizedObjectResult>(result.Result);
        }

        [Fact]
        public async Task Verify2Fa_WhenPendingEmployeeNoLongerExists_ReturnsUnauthorized()
        {
            _session.SetString("Pending2FAEmail", "deleted@artifax.demo");

            var result = await _controller.Verify2Fa(new Dictionary<string, string> { ["code"] = "123456" });

            Assert.IsType<UnauthorizedResult>(result.Result);
        }

        [Fact]
        public async Task Verify2Fa_WithWrongCode_ReturnsUnauthorized_AndDoesNotSignIn()
        {
            _session.SetString("Pending2FAEmail", "admin@artifax.demo");

            var result = await _controller.Verify2Fa(new Dictionary<string, string> { ["code"] = "000000" });

            Assert.IsType<UnauthorizedObjectResult>(result.Result);
            Assert.Null(_session.GetString("UserLevel"));
        }

        [Fact]
        public async Task Verify2Fa_WithCurrentCode_SignsIn()
        {
            _session.SetString("Pending2FAEmail", "admin@artifax.demo");
            string code = new TwoFactorAuthenticator().GetCurrentPIN("EXISTINGSECRET1234567890");

            var result = await _controller.Verify2Fa(new Dictionary<string, string> { ["code"] = code });

            var dto = Assert.IsType<EmployeeReadDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
            Assert.Equal("Ada Admin", dto.EmployeeName);
            Assert.Null(_session.GetString("Pending2FAEmail"));
            Assert.Equal("Admin", _session.GetString("UserLevel"));
            Assert.Equal("admin@artifax.demo", _session.GetString("UserEmail"));
            Assert.Equal("Ada Admin", _session.GetString("Username"));
        }

        [Fact]
        public void Logout_ClearsSession_AndExpiresCookie()
        {
            SignInAs("Admin");

            var result = _controller.LogOutUser();

            Assert.IsType<NoContentResult>(result);
            Assert.Empty(_session.Keys);
            Assert.Contains(".AspNetCore.Session=", _controller.Response.Headers.SetCookie.ToString());
        }

        #endregion

        #region Create

        [Fact]
        public async Task CreateEmployee_AsNonAdmin_ReturnsUnauthorized()
        {
            SignInAs("Employee");

            var result = await _controller.CreateEmployee(NewEmployee());

            Assert.IsType<UnauthorizedObjectResult>(result.Result);
            Assert.Equal(3, _context.Employees.Count());
        }

        [Fact]
        public async Task CreateEmployee_WithDuplicateEmail_ReturnsUnauthorized()
        {
            SignInAs("Admin");

            var result = await _controller.CreateEmployee(NewEmployee(email: "worker@artifax.demo"));

            Assert.IsType<UnauthorizedObjectResult>(result.Result);
            Assert.Equal(3, _context.Employees.Count());
        }

        [Fact]
        public async Task CreateEmployee_AsAdmin_CreatesWithHashedPassword()
        {
            SignInAs("Admin");

            var result = await _controller.CreateEmployee(NewEmployee());

            var created = Assert.IsType<CreatedAtActionResult>(result.Result);
            var dto = Assert.IsType<EmployeeReadDto>(created.Value);
            Assert.Equal("Nina New", dto.EmployeeName);
            Assert.Equal(2, dto.BranchId);
            var saved = _context.Employees.Single(e => e.EmployeeEmail == "new@artifax.demo");
            Assert.NotEqual("NewPass1!", saved.EmployeePasswordHash);
            Assert.True(BCrypt.Net.BCrypt.Verify("NewPass1!", saved.EmployeePasswordHash));
        }

        #endregion

        #region Update

        [Fact]
        public async Task ChangeEmployeeBranch_AsNonAdmin_ReturnsUnauthorized()
        {
            var result = await _controller.ChangeEmployeeBranch("worker@artifax.demo", 2);

            Assert.IsType<UnauthorizedObjectResult>(result.Result);
        }

        [Fact]
        public async Task ChangeEmployeeBranch_WhenEmployeeMissing_ReturnsNotFound()
        {
            SignInAs("Admin");

            var result = await _controller.ChangeEmployeeBranch("nobody@artifax.demo", 2);

            Assert.IsType<NotFoundObjectResult>(result.Result);
        }

        [Fact]
        public async Task ChangeEmployeeBranch_WhenBranchMissing_ReturnsNotFound()
        {
            SignInAs("Admin");

            var result = await _controller.ChangeEmployeeBranch("worker@artifax.demo", 99);

            Assert.IsType<NotFoundObjectResult>(result.Result);
            Assert.Equal(1, _context.Employees.Single(e => e.EmployeeId == 1).BranchId);
        }

        [Fact]
        public async Task ChangeEmployeeBranch_AsAdmin_MovesEmployee()
        {
            SignInAs("Admin");

            var result = await _controller.ChangeEmployeeBranch("worker@artifax.demo", 2);

            var dto = Assert.IsType<EmployeeReadDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
            Assert.Equal(2, dto.BranchId);
            Assert.Equal(2, _context.Employees.Single(e => e.EmployeeId == 1).BranchId);
        }

        [Fact]
        public async Task ChangeEmployeeDetails_WhenEmployeeMissing_ReturnsNotFound()
        {
            SignInAs("Admin");

            var result = await _controller.ChangeEmployeeDetails("nobody@artifax.demo", NewEmployee());

            Assert.IsType<NotFoundObjectResult>(result.Result);
        }

        [Fact]
        public async Task ChangeEmployeeDetails_AsNonAdmin_ReturnsUnauthorized()
        {
            SignInAs("Employee");

            var result = await _controller.ChangeEmployeeDetails("worker@artifax.demo", NewEmployee());

            Assert.IsType<UnauthorizedObjectResult>(result.Result);
            Assert.Equal("Wanda Worker", _context.Employees.Single(e => e.EmployeeId == 1).EmployeeName);
        }

        [Fact]
        public async Task ChangeEmployeeDetails_WithNewPassword_UpdatesDetailsAndPassword()
        {
            SignInAs("Admin");

            var result = await _controller.ChangeEmployeeDetails("worker@artifax.demo", NewEmployee(email: "wanda@artifax.demo", password: "Changed1!"));

            var dto = Assert.IsType<EmployeeReadDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
            Assert.Equal("wanda@artifax.demo", dto.EmployeeEmail);
            Assert.Equal("Nina New", dto.EmployeeName);
            Assert.True(BCrypt.Net.BCrypt.Verify("Changed1!", _context.Employees.Single(e => e.EmployeeId == 1).EmployeePasswordHash));
        }

        [Fact]
        public async Task ChangeEmployeeDetails_WithBlankPassword_KeepsExistingPassword()
        {
            SignInAs("Admin");

            var result = await _controller.ChangeEmployeeDetails("worker@artifax.demo", NewEmployee(password: "   "));

            Assert.IsType<OkObjectResult>(result.Result);
            Assert.True(BCrypt.Net.BCrypt.Verify(Password, _context.Employees.Single(e => e.EmployeeId == 1).EmployeePasswordHash));
        }

        #endregion

        #region Delete

        [Fact]
        public async Task DeleteEmployee_AsNonAdmin_ReturnsUnauthorized()
        {
            var result = await _controller.DeleteEmployee(1);

            Assert.IsType<UnauthorizedObjectResult>(result);
            Assert.Equal(3, _context.Employees.Count());
        }

        [Fact]
        public async Task DeleteEmployee_WhenMissing_ReturnsNotFound()
        {
            SignInAs("Admin");

            var result = await _controller.DeleteEmployee(100);

            Assert.IsType<NotFoundObjectResult>(result);
        }

        [Fact]
        public async Task DeleteEmployee_AsAdmin_RemovesEmployee()
        {
            SignInAs("Admin");

            var result = await _controller.DeleteEmployee(2);

            Assert.IsType<NoContentResult>(result);
            Assert.Null(_context.Employees.Find(2));
            Assert.Equal(2, _context.Employees.Count());
        }

        #endregion
    }
}
