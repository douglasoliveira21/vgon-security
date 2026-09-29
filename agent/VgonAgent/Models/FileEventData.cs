using System.Text.Json.Serialization;

namespace VgonAgent.Models;

// Metadata only (section 9) — file contents are never read.
public sealed class FileEventData
{
    [JsonPropertyName("path")]
    public required string Path { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("extension")]
    public string? Extension { get; init; }

    [JsonPropertyName("sizeBytes")]
    public long? SizeBytes { get; init; }

    [JsonPropertyName("user")]
    public string? User { get; init; }

    [JsonPropertyName("previousPath")]
    public string? PreviousPath { get; init; }
}
