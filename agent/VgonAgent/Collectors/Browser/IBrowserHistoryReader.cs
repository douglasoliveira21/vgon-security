namespace VgonAgent.Collectors.Browser;

/// <summary>
/// One implementation per browser family (section 8: "cada navegador possui mecanismos
/// diferentes"). The Agent runs as a Windows Service (LocalSystem), so it cannot rely on
/// per-user environment variables — readers must enumerate actual `C:\Users\*` profile
/// directories rather than use Environment.GetFolderPath, which resolves for the service's
/// own account, not the interactive users being monitored.
/// </summary>
public interface IBrowserHistoryReader
{
    string BrowserName { get; }

    /// <summary>Finds every user's history database for this browser currently on disk.</summary>
    IEnumerable<ProfileHistoryDatabase> DiscoverDatabases();

    /// <summary>
    /// Reads visits recorded after <paramref name="sinceUtc"/>. The reader copies the source
    /// database file first (browsers hold it open) rather than reading it in place.
    /// </summary>
    IReadOnlyList<BrowserVisit> ReadVisitsSince(ProfileHistoryDatabase database, DateTimeOffset sinceUtc, string tempDirectory);
}
