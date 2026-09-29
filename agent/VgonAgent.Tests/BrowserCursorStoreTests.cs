using VgonAgent.Collectors.Browser;

namespace VgonAgent.Tests;

public sealed class BrowserCursorStoreTests : IDisposable
{
    private readonly string _tempDir;

    public BrowserCursorStoreTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "vgon-cursor-tests-" + Guid.NewGuid());
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { /* best-effort cleanup */ }
    }

    [Fact]
    public void Returns_the_provided_default_for_a_database_never_seen_before()
    {
        var store = new BrowserCursorStore(_tempDir);
        var fallback = DateTimeOffset.UtcNow;

        var cursor = store.GetCursor(@"C:\some\History", fallback);

        Assert.Equal(fallback, cursor);
    }

    [Fact]
    public void Set_then_get_returns_the_stored_value_within_the_same_instance()
    {
        var store = new BrowserCursorStore(_tempDir);
        var value = new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

        store.SetCursor(@"C:\some\History", value);

        Assert.Equal(value, store.GetCursor(@"C:\some\History", DateTimeOffset.MinValue));
    }

    [Fact]
    public void Cursor_survives_a_restart_by_reloading_from_the_persisted_file()
    {
        var value = new DateTimeOffset(2026, 3, 15, 8, 30, 0, TimeSpan.Zero);
        var first = new BrowserCursorStore(_tempDir);
        first.SetCursor(@"C:\some\History", value);

        var second = new BrowserCursorStore(_tempDir); // simulates a service restart

        Assert.Equal(value, second.GetCursor(@"C:\some\History", DateTimeOffset.MinValue));
    }
}
