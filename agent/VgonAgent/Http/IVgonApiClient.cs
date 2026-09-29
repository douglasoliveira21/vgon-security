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
}
