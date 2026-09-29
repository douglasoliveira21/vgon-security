using System.Text.Json;
using VgonAgent.Models;

namespace VgonAgent.Collectors.Software;

/// <summary>
/// Persists the last known installed-software set so a service restart doesn't cause the next
/// run to report the entire inventory as "added" again — only genuinely new changes since the
/// last successful send.
/// </summary>
public sealed class SoftwareSnapshotStore
{
    private readonly string _filePath;

    public SoftwareSnapshotStore(string dataDirectory)
    {
        Directory.CreateDirectory(dataDirectory);
        _filePath = Path.Combine(dataDirectory, "software-snapshot.json");
    }

    private string SyncFilePath => Path.Combine(Path.GetDirectoryName(_filePath)!, "software-sync.txt");

    /// <summary>
    /// The inventory is sent as a delta, so a delta that is lost in transit (queue purged after repeated
    /// upload failures, API down for a while) would never be re-sent — the Cloud would stay empty forever.
    /// A periodic full re-send heals that; the Cloud upserts by (device, name, version), so it is idempotent.
    /// </summary>
    public bool IsFullSyncDue(DateTimeOffset now, TimeSpan interval)
    {
        try
        {
            if (!File.Exists(SyncFilePath)) return true;
            return DateTimeOffset.TryParse(File.ReadAllText(SyncFilePath), out var last) ? now - last >= interval : true;
        }
        catch
        {
            return true;
        }
    }

    public void MarkFullSync(DateTimeOffset now)
    {
        try { File.WriteAllText(SyncFilePath, now.ToString("O")); }
        catch { /* non-fatal — worst case another full send happens next cycle */ }
    }

    public Dictionary<string, SoftwareItem> Load()
    {
        if (!File.Exists(_filePath)) return new Dictionary<string, SoftwareItem>();
        try
        {
            var json = File.ReadAllText(_filePath);
            var items = JsonSerializer.Deserialize<List<SoftwareItem>>(json) ?? [];
            return items.ToDictionary(SoftwareDiffer.Key);
        }
        catch
        {
            // Corrupt snapshot — treat as empty so the collector just re-reports the full
            // current inventory once rather than crashing.
            return new Dictionary<string, SoftwareItem>();
        }
    }

    public void Save(IReadOnlyCollection<SoftwareItem> items)
    {
        try
        {
            File.WriteAllText(_filePath, JsonSerializer.Serialize(items));
        }
        catch
        {
            // Non-fatal — next successful cycle will persist again.
        }
    }
}
