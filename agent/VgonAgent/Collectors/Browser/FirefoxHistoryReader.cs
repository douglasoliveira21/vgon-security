using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using VgonAgent.Collectors;

namespace VgonAgent.Collectors.Browser;

/// <summary>Firefox uses a different schema (places.sqlite) and epoch (PRTime: microseconds
/// since the Unix epoch) than Chromium-based browsers, hence a separate reader.</summary>
public sealed class FirefoxHistoryReader : IBrowserHistoryReader
{
    private readonly ILogger _logger;

    public string BrowserName => "Firefox";

    public FirefoxHistoryReader(ILogger logger)
    {
        _logger = logger;
    }

    public IEnumerable<ProfileHistoryDatabase> DiscoverDatabases()
    {
        foreach (var (userName, profileDir) in UserProfiles.Enumerate())
        {
            var profilesRoot = Path.Combine(profileDir, "AppData", "Roaming", "Mozilla", "Firefox", "Profiles");
            if (!Directory.Exists(profilesRoot)) continue;

            foreach (var profilePath in SafeEnumerateDirectories(profilesRoot))
            {
                var placesFile = Path.Combine(profilePath, "places.sqlite");
                if (File.Exists(placesFile))
                {
                    yield return new ProfileHistoryDatabase(BrowserName, profilePath, userName, placesFile);
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
                SELECT url, title, last_visit_date
                FROM moz_places
                WHERE last_visit_date IS NOT NULL AND last_visit_date > $since AND hidden = 0
                ORDER BY last_visit_date ASC
                LIMIT 500;
                """;
            command.Parameters.AddWithValue("$since", ToPrTime(sinceUtc));

            var visits = new List<BrowserVisit>();
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                var url = reader.GetString(0);
                var title = reader.IsDBNull(1) ? null : reader.GetString(1);
                var visitedAt = FromPrTime(reader.GetInt64(2));
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

    private static long ToPrTime(DateTimeOffset time) => time.ToUnixTimeMilliseconds() * 1000;

    private static DateTimeOffset FromPrTime(long prTimeMicroseconds) =>
        DateTimeOffset.FromUnixTimeMilliseconds(prTimeMicroseconds / 1000);
}
