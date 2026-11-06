using Artifax.Data;
using Artifax.Services;
using DotNetEnv;
using Microsoft.EntityFrameworkCore;

// Load environment variables from .env.local file
Env.Load();

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
//Cors
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp",
        policy =>
        {
                        // Replace with your actual React app's URL/Port
                        policy.WithOrigins("http://localhost:3000", "http://localhost:3001", "http://localhost:5253") 
                  .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        });
});

builder.Services.AddControllers();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

// Prefer configured connection string (appsettings/user-secrets), then fall back to DATABASE_* vars.
var connectionString = builder.Configuration.GetConnectionString("ArtifaxDatabase");

if (string.IsNullOrWhiteSpace(connectionString))
{
    var host = Environment.GetEnvironmentVariable("DATABASE_HOST");
    var port = Environment.GetEnvironmentVariable("DATABASE_PORT");
    var database = Environment.GetEnvironmentVariable("DATABASE_NAME");
    var username = Environment.GetEnvironmentVariable("DATABASE_USERNAME");
    var password = Environment.GetEnvironmentVariable("DATABASE_PASSWORD");

    connectionString = $"Host={host};Port={port};Database={database};Username={username};Password={password};SSL Mode=Require;Trust Server Certificate=true";
}

// After the fallback above the string is never empty, so a missing host is the only failure case.
if (connectionString.Contains("Host=;"))
{
    throw new InvalidOperationException(
        "Database connection is not configured. Set ConnectionStrings:ArtifaxDatabase (user-secrets) or DATABASE_* environment variables.");
}

builder.Services.AddDbContext<ArtifaxContext>(options => options.UseNpgsql(connectionString));

// Register the background service for order time tracking
builder.Services.AddHostedService<OrderTimeTrackingService>();

builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(option => {
    option.IdleTimeout = TimeSpan.FromHours(14);
    option.Cookie.HttpOnly = true;
    option.Cookie.IsEssential = true;

    option.Cookie.SameSite = SameSiteMode.None; 
    option.Cookie.SecurePolicy = CookieSecurePolicy.Always;
});

var app = builder.Build();

// Schema (including the legacy OrderItems table) is managed by EF migrations: run `dotnet ef database update`.

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.MapOpenApi();
}

app.UseCors("AllowReactApp");

app.UseHttpsRedirection();

app.UseSession();

app.UseAuthorization();

app.MapControllers();

app.Run();

// Exposes the top-level Program class to WebApplicationFactory in the integration tests.
public partial class Program { }
