using System.Text.Json.Serialization;

namespace VgonAgent.Models;

// Mirrors apps/api/src/events/dto/ingest-events.dto.ts: tenantId/deviceId are intentionally
// NOT sent — the API derives them from the authenticated device (the access token).
public sealed class EventEnvelope
{
    [JsonPropertyName("eventId")]
    public string EventId { get; init; } = Guid.NewGuid().ToString();

    [JsonPropertyName("userId")]
    public string? UserId { get; init; }

    [JsonPropertyName("agentVersion")]
    public required string AgentVersion { get; init; }

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }

    [JsonPropertyName("eventType")]
    public required string EventType { get; init; }

    [JsonPropertyName("severity")]
    public required string Severity { get; init; }

    [JsonPropertyName("schemaVersion")]
    public int SchemaVersion { get; init; } = 1;

    [JsonPropertyName("data")]
    public required object Data { get; init; }
}

public static class EventSeverity
{
    public const string Info = "INFO";
    public const string Low = "LOW";
    public const string Medium = "MEDIUM";
    public const string High = "HIGH";
    public const string Critical = "CRITICAL";
}

public static class EventType
{
    public const string ProcessStarted = "process.started";
    public const string ProcessStopped = "process.stopped";
    public const string BrowserNavigation = "browser.navigation";
    public const string FileCreated = "file.created";
    public const string FileModified = "file.modified";
    public const string FileRenamed = "file.renamed";
    public const string FileDeleted = "file.deleted";
    public const string UsbConnected = "usb.connected";
    public const string UsbDisconnected = "usb.disconnected";
    public const string PrintJob = "printer.job";
    public const string HardwareInventory = "hardware.inventory";
    public const string SoftwareInventory = "software.inventory";
    public const string SecurityState = "security.state";
}

public static class BrowserUrlPolicy
{
    public const string FullUrl = "FULL_URL";
    public const string DomainOnly = "DOMAIN_ONLY";
    public const string SanitizedUrl = "SANITIZED_URL";
}

public static class UsbPolicyDecision
{
    public const string Allowed = "ALLOWED";
    public const string Blocked = "BLOCKED";
    public const string Monitored = "MONITORED";
}

// Section 10: what the Agent should do with a USB device that isn't in the allowlist.
public static class UsbPolicy
{
    public const string Allow = "ALLOW";
    public const string Block = "BLOCK";
    public const string Monitor = "MONITOR";
}
