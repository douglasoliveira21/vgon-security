using System.Text.Json;

namespace VgonAgent.Collectors.Browser;

/// <summary>
/// Tracks the last visit timestamp emitted per profile database so a service restart doesn't
/// resend a user's entire browsing history — only genuinely new visits since the last poll.
/// </summary>
public sealed class BrowserCursorStore
{
    private readonly string _filePath;
    private readonly Dictionary<string, DateTimeOffset> _cursors;

    public BrowserCursorStore(string dataDirectory)
    {
        Directory.CreateDirectory(dataDirectory);
        _filePath = Path.Combine(dataDirectory, "browser-cursors.json");
        _cursors = Load();
    }

    public DateTimeOffset GetCursor(string databasePath, DateTimeOffset defaultValue) =>
        _cursors.TryGetValue(databasePath, out var value) ? value : defaultValue;

    public void SetCursor(string databasePath, DateTimeOffset value)
    {
        _cursors[databasePath] = value;
        Persist();
    }

    private Dictionary<string, DateTimeOffset> Load()
    {
        if (!File.Exists(_filePath)) return new Dictionary<string, DateTimeOffset>();
        try
        {
            var json = File.ReadAllText(_filePath);
            return JsonSerializer.Deserialize<Dictionary<string, DateTimeOffset>>(json)
                ?? new Dictionary<string, DateTimeOffset>();
        }
        catch
        {
            // Corrupt/partial cursor file — start fresh rather than crash the collector.
            // Worst case this replays some already-seen history once.
            return new Dictionary<string, DateTimeOffset>();
        }
    }

    private void Persist()
    {
        try
        {
            File.WriteAllText(_filePath, JsonSerializer.Serialize(_cursors));
        }
        catch
        {
            // Non-fatal — next successful cycle will persist again.
        }
    }
}
