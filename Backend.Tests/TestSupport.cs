using Artifax.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests
{
    /// <summary>In-memory ISession so controllers can read/write session values in unit tests.</summary>
    public sealed class FakeSession : ISession
    {
        private readonly Dictionary<string, byte[]> _store = new();
        public bool IsAvailable => true;
        public string Id { get; } = Guid.NewGuid().ToString();
        public IEnumerable<string> Keys => _store.Keys;
        public void Set(string key, byte[] value) => _store[key] = value;
        public bool TryGetValue(string key, out byte[] value) => _store.TryGetValue(key, out value);
        public void Remove(string key) => _store.Remove(key);
        public void Clear() => _store.Clear();
        public Task CommitAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task LoadAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    public static class TestSupport
    {
        /// <summary>A fresh, isolated in-memory database for one test.</summary>
        public static ArtifaxContext NewContext() =>
            new(new DbContextOptionsBuilder<ArtifaxContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options);

        /// <summary>Gives a controller an HttpContext backed by the given session.</summary>
        public static T WithSession<T>(this T controller, ISession session) where T : ControllerBase
        {
            controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { Session = session } };
            return controller;
        }
    }
}
