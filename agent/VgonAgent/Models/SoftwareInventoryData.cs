using System.Text.Json.Serialization;

namespace VgonAgent.Models;

public sealed class SoftwareItem
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("version")]
    public string? Version { get; init; }

    [JsonPropertyName("publisher")]
    public string? Publisher { get; init; }

    [JsonPropertyName("architecture")]
    public string? Architecture { get; init; }

    [JsonPropertyName("installedAt")]
    public string? InstalledAt { get; init; }
}

// Incremental by design (section 12) — only added/removed since the Agent's last snapshot.
public sealed class SoftwareInventoryData
{
    [JsonPropertyName("added")]
    public required List<SoftwareItem> Added { get; init; }

    [JsonPropertyName("removed")]
    public required List<SoftwareItem> Removed { get; init; }
}
