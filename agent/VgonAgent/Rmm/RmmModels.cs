using System.Text.Json.Serialization;

namespace VgonAgent.Rmm;

public sealed class PendingRemoteAction
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("requestedAt")]
    public required string RequestedAt { get; init; }
}

public sealed class CompleteRemoteActionRequest
{
    [JsonPropertyName("success")]
    public required bool Success { get; init; }

    [JsonPropertyName("result")]
    public object? Result { get; init; }

    [JsonPropertyName("errorMessage")]
    public string? ErrorMessage { get; init; }
}

public static class RemoteActionType
{
    public const string RefreshPolicy = "REFRESH_POLICY";
    public const string CollectInventory = "COLLECT_INVENTORY";
    public const string RestartAgent = "RESTART_AGENT";
    public const string RestartDevice = "RESTART_DEVICE";
    public const string WipeDevice = "WIPE_DEVICE";
    public const string LockSession = "LOCK_SESSION";
    public const string StartScreenView = "START_SCREEN_VIEW";
    public const string CaptureScreenshot = "CAPTURE_SCREENSHOT";
}

public sealed class LatestReleaseInfo
{
    [JsonPropertyName("version")]
    public required string Version { get; init; }

    [JsonPropertyName("channel")]
    public required string Channel { get; init; }

    [JsonPropertyName("downloadUrl")]
    public required string DownloadUrl { get; init; }

    [JsonPropertyName("sha256")]
    public required string Sha256 { get; init; }

    [JsonPropertyName("mandatory")]
    public bool Mandatory { get; init; }

    [JsonPropertyName("releaseNotes")]
    public string? ReleaseNotes { get; init; }
}
