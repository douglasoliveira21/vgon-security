using System.Text.Json.Serialization;

namespace VgonAgent.Models;

// Mirrors packages/shared/src/event-envelope.ts BrowserEventData. `Url` is already
// policy-filtered (see Collectors/Browser/UrlSanitizer.cs) before this ever leaves the Agent.
public sealed class BrowserEventData
{
    [JsonPropertyName("browser")]
    public required string Browser { get; init; }

    [JsonPropertyName("url")]
    public required string Url { get; init; }

    [JsonPropertyName("domain")]
    public required string Domain { get; init; }

    [JsonPropertyName("title")]
    public string? Title { get; init; }

    [JsonPropertyName("user")]
    public string? User { get; init; }

    [JsonPropertyName("visitedAt")]
    public required string VisitedAt { get; init; }
}
