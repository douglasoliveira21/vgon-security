using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using VgonAgent.Collectors.Browser;

namespace VgonAgent.Tests;

public sealed class ChromiumHistoryReaderTests : IDisposable
{
    private readonly string _tempDir;
    private readonly string _historyPath;
    private static readonly DateTimeOffset WebKitEpoch = new(1601, 1, 1, 0, 0, 0, TimeSpan.Zero);

    public ChromiumHistoryReaderTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "vgon-chromium-tests-" + Guid.NewGuid());
        Directory.CreateDirectory(_tempDir);
        _historyPath = Path.Combine(_tempDir, "History");
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { /* best-effort cleanup */ }
    }

    private void SeedHistoryDatabase(params (string Url, string Title, DateTimeOffset VisitedAt, bool Hidden)[] rows)
    {
        // Pooling=False so Dispose() actually releases the OS file handle immediately — this test
        // then reopens the same path itself to assert the reader never left it locked.
        using var connection = new SqliteConnection(
            new SqliteConnectionStringBuilder { DataSource = _historyPath, Pooling = false }.ToString());
        connection.Open();

        using (var create = connection.CreateCommand())
        {
            create.CommandText = """
                CREATE TABLE urls (
                    id INTEGER PRIMARY KEY,
                    url LONGVARCHAR,
                    title LONGVARCHAR,
                    visit_count INTEGER DEFAULT 0,
                    last_visit_time INTEGER NOT NULL,
                    hidden INTEGER DEFAULT 0
                );
                """;
            create.ExecuteNonQuery();
        }

        foreach (var (url, title, visitedAt, hidden) in rows)
        {
            using var insert = connection.CreateCommand();
            insert.CommandText = "INSERT INTO urls (url, title, last_visit_time, hidden) VALUES ($url, $title, $time, $hidden);";
            insert.Parameters.AddWithValue("$url", url);
            insert.Parameters.AddWithValue("$title", title);
            insert.Parameters.AddWithValue("$time", (long)((visitedAt - WebKitEpoch).Ticks / 10));
            insert.Parameters.AddWithValue("$hidden", hidden ? 1 : 0);
            insert.ExecuteNonQuery();
        }
    }

    [Fact]
    public void Reads_visits_and_correctly_converts_WebKit_timestamps_back_to_UTC()
    {
        var visitedAt = new DateTimeOffset(2026, 6, 15, 10, 30, 0, TimeSpan.Zero);
        SeedHistoryDatabase(("https://example.com/", "Example", visitedAt, false));

        var reader = new ChromiumHistoryReader("Chrome", "irrelevant", NullLogger.Instance);
        var database = new ProfileHistoryDatabase("Chrome", _tempDir, "alice", _historyPath);

        var visits = reader.ReadVisitsSince(database, DateTimeOffset.MinValue, Path.Combine(_tempDir, "cache"));

        var visit = Assert.Single(visits);
        Assert.Equal("https://example.com/", visit.Url);
        Assert.Equal("Example", visit.Title);
        // WebKit time has microsecond precision; allow a tiny tolerance for round-trip conversion.
        Assert.True(Math.Abs((visit.VisitedAt - visitedAt).TotalMilliseconds) < 1);
    }

    [Fact]
    public void Only_returns_visits_strictly_after_the_given_cursor()
    {
        var older = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var newer = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero);
        SeedHistoryDatabase(
            ("https://old.example.com/", "Old", older, false),
            ("https://new.example.com/", "New", newer, false));

        var reader = new ChromiumHistoryReader("Chrome", "irrelevant", NullLogger.Instance);
        var database = new ProfileHistoryDatabase("Chrome", _tempDir, "alice", _historyPath);

        var cursor = new DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero);
        var visits = reader.ReadVisitsSince(database, cursor, Path.Combine(_tempDir, "cache"));

        var visit = Assert.Single(visits);
        Assert.Equal("https://new.example.com/", visit.Url);
    }

    [Fact]
    public void Hidden_urls_are_excluded()
    {
        SeedHistoryDatabase(("https://hidden.example.com/", "Hidden", DateTimeOffset.UtcNow, true));

        var reader = new ChromiumHistoryReader("Chrome", "irrelevant", NullLogger.Instance);
        var database = new ProfileHistoryDatabase("Chrome", _tempDir, "alice", _historyPath);

        var visits = reader.ReadVisitsSince(database, DateTimeOffset.MinValue, Path.Combine(_tempDir, "cache"));

        Assert.Empty(visits);
    }

    [Fact]
    public void Reading_does_not_lock_or_modify_the_original_history_file()
    {
        SeedHistoryDatabase(("https://example.com/", "Example", DateTimeOffset.UtcNow, false));
        var originalBytes = File.ReadAllBytes(_historyPath);

        var reader = new ChromiumHistoryReader("Chrome", "irrelevant", NullLogger.Instance);
        var database = new ProfileHistoryDatabase("Chrome", _tempDir, "alice", _historyPath);
        reader.ReadVisitsSince(database, DateTimeOffset.MinValue, Path.Combine(_tempDir, "cache"));

        // The source file must still be openable for writing afterward (the collector must
        // never interfere with the browser's own access to its history file).
        using var stream = new FileStream(_historyPath, FileMode.Open, FileAccess.ReadWrite);
        Assert.Equal(originalBytes.Length, stream.Length);
    }
}
