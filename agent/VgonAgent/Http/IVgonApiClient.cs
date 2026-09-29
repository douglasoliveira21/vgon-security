using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Rmm;

namespace VgonAgent.Http;

public interface IVgonApiClient
{
    Task<DeviceTokenResponse> RegisterAsync(RegisterDeviceRequest request, CancellationToken ct);
    Task<DeviceTokenResponse> RefreshAsync(RefreshTokenRequest request, CancellationToken ct);
    Task SendHeartbeatAsync(string accessToken, HeartbeatRequest request, CancellationToken ct);
    Task<int> IngestEventsAsync(string accessToken, IReadOnlyList<EventEnvelope> events, CancellationToken ct);
    Task<EffectivePolicy> GetPolicyAsync(string accessToken, CancellationToken ct);
    Task<IReadOnlyList<PendingRemoteAction>> GetPendingActionsAsync(string accessToken, CancellationToken ct);
    Task CompleteActionAsync(string accessToken, string actionId, CompleteRemoteActionRequest request, CancellationToken ct);
    Task<LatestReleaseInfo?> GetLatestReleaseAsync(string accessToken, string channel, CancellationToken ct);

    /// <summary>Uploads one screenshot for the periodic (silent) ScreenshotCollector. Fire-and-forget
    /// from the Cloud's point of view — no response body beyond a 2xx/error status.</summary>
    Task UploadScreenshotAsync(string accessToken, byte[] jpegBytes, DateTimeOffset capturedAt, int? width, int? height, CancellationToken ct);

    /// <summary>Uploads one live-view frame and returns whether the Agent should keep streaming —
    /// this is how the Cloud tells the Agent to stop (dashboard clicked "stop", or the session's
    /// max duration elapsed server-side too), without a separate polled remote action.</summary>
    Task<bool> UploadScreenFrameAsync(string accessToken, string sessionId, byte[] jpegBytes, CancellationToken ct);
}
