using VgonAgent.Models;

namespace VgonAgent.Collectors.Software;

public sealed record SoftwareDiff(List<SoftwareItem> Added, List<SoftwareItem> Removed);

/// <summary>
/// Pure diffing so the Agent only ever sends what changed (section 12), keyed by name+version
/// since the same app name can have multiple versions installed side by side.
/// </summary>
public static class SoftwareDiffer
{
    public static SoftwareDiff Diff(IReadOnlyCollection<SoftwareItem> current, IReadOnlyDictionary<string, SoftwareItem> previous)
    {
        var currentByKey = current.ToDictionary(Key);

        var added = currentByKey
            .Where(kv => !previous.ContainsKey(kv.Key))
            .Select(kv => kv.Value)
            .ToList();

        var removed = previous
            .Where(kv => !currentByKey.ContainsKey(kv.Key))
            .Select(kv => kv.Value)
            .ToList();

        return new SoftwareDiff(added, removed);
    }

    public static string Key(SoftwareItem item) => $"{item.Name}|{item.Version ?? string.Empty}";
}
