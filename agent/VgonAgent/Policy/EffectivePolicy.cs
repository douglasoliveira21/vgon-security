using System.Text.Json.Serialization;

namespace VgonAgent.Policy;

// Mirrors packages/shared/src/policy.ts EffectivePolicy — what GET /agents/policy returns.
// Every settings object's fields are nullable: the Cloud already resolved the Tenant->Site->
// Group->Device hierarchy and filled in its own server-side defaults, but a field can still be
// missing if the Agent's local bootstrap defaults (before the first successful fetch) don't
// cover something new — collectors always fall back to their own AgentOptions default.
public sealed class EffectivePolicy
{
    [JsonPropertyName("version")]
    public long Version { get; init; }

    [JsonPropertyName("browser")]
    public BrowserPolicySettings Browser { get; init; } = new();

    [JsonPropertyName("file")]
    public FilePolicySettings File { get; init; } = new();

    [JsonPropertyName("usb")]
    public UsbPolicySettings Usb { get; init; } = new();

    [JsonPropertyName("application")]
    public ApplicationPolicySettings Application { get; init; } = new();

    [JsonPropertyName("security")]
    public SecurityPolicySettings Security { get; init; } = new();

    [JsonPropertyName("agent")]
    public AgentPolicySettings Agent { get; init; } = new();

    [JsonPropertyName("collection")]
    public CollectionPolicySettings Collection { get; init; } = new();
}

public sealed class BrowserPolicySettings
{
    [JsonPropertyName("urlPolicy")]
    public string? UrlPolicy { get; init; }

    [JsonPropertyName("sensitiveParams")]
    public List<string>? SensitiveParams { get; init; }

    [JsonPropertyName("pollIntervalSeconds")]
    public int? PollIntervalSeconds { get; init; }
}

public sealed class FilePolicySettings
{
    [JsonPropertyName("watchFolders")]
    public List<string>? WatchFolders { get; init; }

    [JsonPropertyName("excludedExtensions")]
    public List<string>? ExcludedExtensions { get; init; }
}

public sealed class UsbAllowlistEntrySettings
{
    [JsonPropertyName("vendorId")]
    public string? VendorId { get; init; }

    [JsonPropertyName("productId")]
    public string? ProductId { get; init; }

    [JsonPropertyName("serial")]
    public string? Serial { get; init; }
}

public sealed class UsbPolicySettings
{
    [JsonPropertyName("defaultPolicy")]
    public string? DefaultPolicy { get; init; }

    [JsonPropertyName("allowlist")]
    public List<UsbAllowlistEntrySettings>? Allowlist { get; init; }
}

public sealed class ApplicationPolicySettings
{
    [JsonPropertyName("suspiciousProcessNames")]
    public List<string>? SuspiciousProcessNames { get; init; }
}

public sealed class SecurityPolicySettings
{
    [JsonPropertyName("collectorIntervalSeconds")]
    public int? CollectorIntervalSeconds { get; init; }
}

public sealed class AgentPolicySettings
{
    [JsonPropertyName("heartbeatIntervalSeconds")]
    public int? HeartbeatIntervalSeconds { get; init; }

    [JsonPropertyName("eventUploadIntervalSeconds")]
    public int? EventUploadIntervalSeconds { get; init; }
}

public sealed class CollectionPolicySettings
{
    [JsonPropertyName("processCollectorEnabled")]
    public bool? ProcessCollectorEnabled { get; init; }

    [JsonPropertyName("browserCollectorEnabled")]
    public bool? BrowserCollectorEnabled { get; init; }

    [JsonPropertyName("fileCollectorEnabled")]
    public bool? FileCollectorEnabled { get; init; }

    [JsonPropertyName("usbCollectorEnabled")]
    public bool? UsbCollectorEnabled { get; init; }

    [JsonPropertyName("printerCollectorEnabled")]
    public bool? PrinterCollectorEnabled { get; init; }

    [JsonPropertyName("hardwareCollectorEnabled")]
    public bool? HardwareCollectorEnabled { get; init; }

    [JsonPropertyName("softwareCollectorEnabled")]
    public bool? SoftwareCollectorEnabled { get; init; }

    [JsonPropertyName("securityCollectorEnabled")]
    public bool? SecurityCollectorEnabled { get; init; }
}
