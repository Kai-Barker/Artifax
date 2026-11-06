using System.Net;
using System.Net.Http.Json;
using Artifax.Data;
using Artifax.Models;
using Google.Authenticator;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Backend.Tests
{
    // These tests change process environment variables, so they must not run in parallel with each other.
    [CollectionDefinition("Program startup", DisableParallelization = true)]
    public class ProgramStartupCollection { }

    /// <summary>
    /// Integration tests: boot the real app (Program.cs) in memory with WebApplicationFactory,
    /// replace PostgreSQL with an in-memory database holding mock data, and call real HTTP endpoints.
    /// Covers startup wiring: configuration, DI, CORS, sessions, Swagger and the connection-string rules.
    /// </summary>
    [Collection("Program startup")]
    public class ProgramIntegrationTests : IDisposable
    {
        private const string ConfiguredConnection = "Host=configured;Port=5432;Database=artifax;Username=u;Password=p";
        private const string Secret = "INTEGRATIONSECRET12345678";
        private static readonly string[] EnvVars =
        {
            "ConnectionStrings__ArtifaxDatabase", "DATABASE_HOST", "DATABASE_PORT", "DATABASE_NAME", "DATABASE_USERNAME", "DATABASE_PASSWORD"
        };

        private readonly List<WebApplicationFactory<Program>> _factories = new();

        public ProgramIntegrationTests() => ClearEnv();

        public void Dispose()
        {
            foreach (var factory in _factories) factory.Dispose();
            ClearEnv();
        }

        private static void ClearEnv()
        {
            foreach (var name in EnvVars) Environment.SetEnvironmentVariable(name, null);
        }

        private WebApplicationFactory<Program> CreateFactory(string environment = "Development")
        {
            string dbName = Guid.NewGuid().ToString();
            var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment(environment);
                builder.ConfigureTestServices(services =>
                {
                    // Swap the PostgreSQL registration for an in-memory database.
                    services.RemoveAll<DbContextOptions<ArtifaxContext>>();
                    services.RemoveAll<IDbContextOptionsConfiguration<ArtifaxContext>>();
                    services.AddDbContext<ArtifaxContext>(o => o.UseInMemoryDatabase(dbName));
                });
            });
            _factories.Add(factory);
            return factory;
        }

        private static HttpClient HttpsClient(WebApplicationFactory<Program> factory) =>
            // The session cookie is Secure-only, so talk to the test server over https.
            factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });

        private static void Seed(WebApplicationFactory<Program> factory)
        {
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ArtifaxContext>();
            db.Branches.AddRange(new Branch { BranchID = 1, BranchName = "Main Branch" }, new Branch { BranchID = 2, BranchName = "Durban Assembly Plant" });
            db.Employees.Add(new Employee
            {
                EmployeeId = 1, EmployeeEmail = "admin@artifax.demo", EmployeeName = "Ada Admin", EmployeeLevel = "Admin", BranchId = 1,
                EmployeePasswordHash = BCrypt.Net.BCrypt.HashPassword("Artifax@2026", 4), TwoFactorSecret = Secret
            });
            db.SaveChanges();
        }

        #region Boot + DI

        [Fact]
        public async Task Development_ServesApiAndSwagger()
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__ArtifaxDatabase", ConfiguredConnection);
            var factory = CreateFactory("Development");
            Seed(factory);
            var client = HttpsClient(factory);

            var branches = await client.GetFromJsonAsync<List<Dictionary<string, object>>>("/api/Branch");
            var swagger = await client.GetAsync("/swagger/v1/swagger.json");
            var openApi = await client.GetAsync("/openapi/v1.json");

            Assert.Equal(2, branches!.Count);
            Assert.Contains(branches, b => b["branchName"].ToString() == "Durban Assembly Plant");
            Assert.Equal(HttpStatusCode.OK, swagger.StatusCode);
            Assert.Equal(HttpStatusCode.OK, openApi.StatusCode);
        }

        [Fact]
        public async Task Production_ServesApi_ButHidesSwagger()
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__ArtifaxDatabase", ConfiguredConnection);
            var factory = CreateFactory("Production");
            Seed(factory);
            var client = HttpsClient(factory);

            var branches = await client.GetAsync("/api/Branch");
            var swagger = await client.GetAsync("/swagger/v1/swagger.json");

            Assert.Equal(HttpStatusCode.OK, branches.StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, swagger.StatusCode);
        }

        #endregion

        #region Connection string rules

        [Fact]
        public async Task WithoutConnectionString_FallsBackToDatabaseEnvironmentVariables()
        {
            Environment.SetEnvironmentVariable("DATABASE_HOST", "fallback-host");
            Environment.SetEnvironmentVariable("DATABASE_PORT", "5432");
            Environment.SetEnvironmentVariable("DATABASE_NAME", "artifax");
            Environment.SetEnvironmentVariable("DATABASE_USERNAME", "u");
            Environment.SetEnvironmentVariable("DATABASE_PASSWORD", "p");
            var factory = CreateFactory("Production");

            var response = await HttpsClient(factory).GetAsync("/api/Branch");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        [Fact]
        public void WithNoDatabaseConfigured_RefusesToStart()
        {
            var factory = CreateFactory("Production");

            var error = Record.Exception(() => factory.CreateClient());

            Assert.NotNull(error);
            var messages = new List<string>();
            for (var e = error; e != null; e = e.InnerException) messages.Add(e.Message);
            Assert.Contains(messages, m => m.StartsWith("Database connection is not configured."));
        }

        #endregion

        #region CORS

        [Fact]
        public async Task Cors_AllowsTheReactDevServer()
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__ArtifaxDatabase", ConfiguredConnection);
            var client = HttpsClient(CreateFactory());
            var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/Branch");
            preflight.Headers.Add("Origin", "http://localhost:3000");
            preflight.Headers.Add("Access-Control-Request-Method", "GET");

            var response = await client.SendAsync(preflight);

            Assert.Equal("http://localhost:3000", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
            Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Credentials").Single());
        }

        [Fact]
        public async Task Cors_RejectsUnknownOrigins()
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__ArtifaxDatabase", ConfiguredConnection);
            var client = HttpsClient(CreateFactory());
            var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/Branch");
            preflight.Headers.Add("Origin", "https://evil.example.com");
            preflight.Headers.Add("Access-Control-Request-Method", "GET");

            var response = await client.SendAsync(preflight);

            Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
        }

        #endregion

        #region Sessions

        [Fact]
        public async Task Session_LoginThen2FA_KeepsUserSignedInAcrossRequests()
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__ArtifaxDatabase", ConfiguredConnection);
            var factory = CreateFactory();
            Seed(factory);
            var client = HttpsClient(factory);

            var before = await client.GetAsync("/api/User/me");
            var login = await client.PostAsJsonAsync("/api/User/employees/login", new { email = "admin@artifax.demo", password = "Artifax@2026" });
            var setup = await client.GetAsync("/api/User/2fa-setup-uri");
            var verify = await client.PostAsJsonAsync("/api/User/employees/verify-2fa",
                new Dictionary<string, string> { ["code"] = new TwoFactorAuthenticator().GetCurrentPIN(Secret) });
            var me = await client.GetFromJsonAsync<Dictionary<string, string>>("/api/User/me");

            Assert.Equal(HttpStatusCode.Unauthorized, before.StatusCode);
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            Assert.Contains(".AspNetCore.Session", string.Join(";", login.Headers.GetValues("Set-Cookie")));
            Assert.Equal(HttpStatusCode.OK, setup.StatusCode);
            Assert.Equal(HttpStatusCode.OK, verify.StatusCode);
            Assert.Equal("Ada Admin", me!["username"]);
            Assert.Equal("Admin", me["userLevel"]);
        }

        #endregion
    }
}
