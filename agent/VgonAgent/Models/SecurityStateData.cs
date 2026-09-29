using System.Text.Json.Serialization;

namespace VgonAgent.Models;

// Mirrors packages/shared/src/event-envelope.ts SecurityStateData. Every field is nullable —
// a check that couldn't be performed (permissions, missing WMI namespace, older Windows) is
// omitted rather than guessed, so the Cloud's rule evaluator treats "unknown" as "unknown", not
// "insecure" (no false-positive Security Findings from a partial payload).
public sealed class SecurityStateData
{
    [JsonPropertyName("windowsVersion")]
    public string? WindowsVersion { get; init; }

    [JsonPropertyName("windowsBuild")]
    public string? WindowsBuild { get; init; }

    [JsonPropertyName("defenderEnabled")]
    public bool? DefenderEnabled { get; init; }

    [JsonPropertyName("firewallEnabled")]
    public bool? FirewallEnabled { get; init; }

    [JsonPropertyName("bitlockerEnabled")]
    public bool? BitlockerEnabled { get; init; }

    [JsonPropertyName("secureBootEnabled")]
    public bool? SecureBootEnabled { get; init; }

    [JsonPropertyName("tpmPresent")]
    public bool? TpmPresent { get; init; }

    [JsonPropertyName("tpmVersion")]
    public string? TpmVersion { get; init; }

    [JsonPropertyName("uacEnabled")]
    public bool? UacEnabled { get; init; }

    [JsonPropertyName("windowsUpdatePendingCritical")]
    public int? WindowsUpdatePendingCritical { get; init; }

    [JsonPropertyName("localAdministrators")]
    public List<string>? LocalAdministrators { get; init; }
}
