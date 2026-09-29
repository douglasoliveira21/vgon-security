using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using VgonAgent.Collectors;

namespace VgonAgent.Collectors.Browser;

/// <summary>Chrome and Edge share the same "History" SQLite schema and WebKit epoch timestamps
/// (microseconds since 1601-01-01 UTC) — one reader parameterized by the profile root covers both.</summary>
public sealed class ChromiumHistoryReader : IBrowserHistoryReader
{
    private static readonly DateTimeOffset WebKitEpoch = new(1601, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private readonly string _relativeUserDataPath;
    private readonly ILogger _logger;

    public string BrowserName { get; }

    public ChromiumHistoryReader(string browserName, string relativeUserDataPath, ILogger logger)
    {
        BrowserName = browserName;
        _relativeUserDataPath = relativeUserDataPath;
        _logger = logger;
    }

    public IEnumerable<ProfileHistoryDatabase> DiscoverDatabases()
    {
        foreach (var (userName, profileDir) in UserProfiles.Enumerate())
        {
            var userDataRoot = Path.Combine(profileDir, "AppData", "Local", _relativeUserDataPath);
            if (!Directory.Exists(userDataRoot)) continue;

            foreach (var profilePath in SafeEnumerateDirectories(userDataRoot))
            {
                var historyFile = Path.Combine(profilePath, "History");
                if (File.Exists(historyFile))
                {
                    yield return new ProfileHistoryDatabase(BrowserName, profilePath, userName, historyFile);
                }
            }
        }
    }

    public IReadOnlyList<BrowserVisit> ReadVisitsSince(ProfileHistoryDatabase database, DateTimeOffset sinceUtc, string tempDirectory)
    {
        var tempCopy = BrowserHistoryCopier.CopyLocked(database.DatabasePath, tempDirectory, _logger);
        if (tempCopy is null) return [];

        try
        {
            using var connection = new SqliteConnection(new SqliteConnectionStringBuilder
            {
                DataSource = tempCopy,
                Mode = SqliteOpenMode.ReadOnly,
            }.ToString());
            connection.Open();

            using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT url, title, last_visit_time
                FROM urls
                WHERE last_visit_time > $since AND hidden = 0
                ORDER BY last_visit_time ASC
                LIMIT 500;
                """;
            command.Parameters.AddWithValue("$since", ToWebKitTime(sinceUtc));

            var visits = new List<BrowserVisit>();
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                var url = reader.GetString(0);
                var title = reader.IsDBNull(1) ? null : reader.GetString(1);
                var visitedAt = FromWebKitTime(reader.GetInt64(2));
                visits.Add(new BrowserVisit(url, title, visitedAt));
            }
            return visits;
        }
        finally
        {
            BrowserHistoryCopier.TryDelete(tempCopy);
        }
    }

    private static IEnumerable<string> SafeEnumerateDirectories(string root)
    {
        try { return Directory.EnumerateDirectories(root); }
        catch { return []; }
    }

    private static long ToWebKitTime(DateTimeOffset time) => (time - WebKitEpoch).Ticks / 10;

    private static DateTimeOffset FromWebKitTime(long webKitMicroseconds) =>
        WebKitEpoch.AddTicks(webKitMicroseconds * 10);
}
