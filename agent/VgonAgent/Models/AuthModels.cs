using System.Text.Json.Serialization;

namespace VgonAgent.Models;

public sealed class RegisterDeviceRequest
{
    [JsonPropertyName("provisioningToken")]
    public required string ProvisioningToken { get; init; }

    [JsonPropertyName("hostname")]
    public required string Hostname { get; init; }

    [JsonPropertyName("agentVersion")]
    public required string AgentVersion { get; init; }

    [JsonPropertyName("os")]
    public string? Os { get; init; }

    [JsonPropertyName("osVersion")]
    public string? OsVersion { get; init; }
}

public sealed class DeviceTokenResponse
{
    [JsonPropertyName("deviceId")]
    public string? DeviceId { get; init; } // present on /register, absent on /token/refresh

    [JsonPropertyName("accessToken")]
    public required string AccessToken { get; init; }

    [JsonPropertyName("refreshToken")]
    public required string RefreshToken { get; init; }

    [JsonPropertyName("expiresIn")]
    public int ExpiresIn { get; init; }
}

public sealed class RefreshTokenRequest
{
    [JsonPropertyName("deviceId")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("refreshToken")]
    public required string RefreshToken { get; init; }
}

public sealed class HeartbeatRequest
{
    [JsonPropertyName("agentVersion")]
    public required string AgentVersion { get; init; }

    [JsonPropertyName("os")]
    public required string Os { get; init; }

    [JsonPropertyName("cpuUsagePercent")]
    public double? CpuUsagePercent { get; init; }

    [JsonPropertyName("memoryUsagePercent")]
    public double? MemoryUsagePercent { get; init; }

    [JsonPropertyName("collectorStatus")]
    public Dictionary<string, string>? CollectorStatus { get; init; }

    [JsonPropertyName("policyVersion")]
    public string? PolicyVersion { get; init; }

    [JsonPropertyName("loggedInUser")]
    public string? LoggedInUser { get; init; }
}

public sealed class IngestEventsRequest
{
    [JsonPropertyName("events")]
    public required List<EventEnvelope> Events { get; init; }
}
