using System.Text.Json.Serialization;

namespace VgonAgent.Models;

// Metadata only — never process command-line arguments (may contain secrets) or memory contents.
public sealed class ProcessEventData
{
    [JsonPropertyName("pid")]
    public int Pid { get; init; }

    [JsonPropertyName("processName")]
    public required string ProcessName { get; init; }

    [JsonPropertyName("path")]
    public string? Path { get; init; }

    [JsonPropertyName("parentPid")]
    public int? ParentPid { get; init; }

    [JsonPropertyName("user")]
    public string? User { get; init; }

    [JsonPropertyName("startedAt")]
    public string? StartedAt { get; init; }

    [JsonPropertyName("stoppedAt")]
    public string? StoppedAt { get; init; }

    [JsonPropertyName("exitCode")]
    public int? ExitCode { get; init; }

    [JsonPropertyName("suspicious")]
    public bool Suspicious { get; init; }

    [JsonPropertyName("suspiciousReason")]
    public string? SuspiciousReason { get; init; }
}
