using Microsoft.Extensions.Logging;
using VgonAgent.Http;
using VgonAgent.Identity;
using VgonAgent.Policy;

namespace VgonAgent.Rmm;

public sealed record RemoteActionResult(bool Success, object? Result, string? ErrorMessage);

/// <summary>
/// Dispatches one pending remote action (section 26/Phase 7) to its effect. Kept separate from
/// the polling loop so the dispatch logic — "given this action type, which dependency gets
/// called" — is unit-testable with fakes, without a real WMI/session/HTTP round trip.
/// </summary>
public sealed class RemoteActionExecutor
{
    private readonly IPolicyStore _policyStore;
    private readonly ICollectionTrigger _trigger;
    private readonly ISystemActions _systemActions;
    private readonly IVgonApiClient _api;
    private readonly IAccessTokenProvider _tokenProvider;
    private readonly ILogger<RemoteActionExecutor> _logger;

    public RemoteActionExecutor(
        IPolicyStore policyStore,
        ICollectionTrigger trigger,
        ISystemActions systemActions,
        IVgonApiClient api,
        IAccessTokenProvider tokenProvider,
        ILogger<RemoteActionExecutor> logger)
    {
        _policyStore = policyStore;
        _trigger = trigger;
        _systemActions = systemActions;
        _api = api;
        _tokenProvider = tokenProvider;
        _logger = logger;
    }

    public async Task<RemoteActionResult> ExecuteAsync(PendingRemoteAction action, CancellationToken ct)
    {
        try
        {
            switch (action.Type)
            {
                case RemoteActionType.RefreshPolicy:
                    var (_, accessToken) = await _tokenProvider.GetAccessTokenAsync(ct);
                    var policy = await _api.GetPolicyAsync(accessToken, ct);
                    _policyStore.Update(policy);
                    return new RemoteActionResult(true, new { policyVersion = policy.Version }, null);

                case RemoteActionType.CollectInventory:
                    _trigger.TriggerNow("hardware");
                    _trigger.TriggerNow("software");
                    _trigger.TriggerNow("security");
                    return new RemoteActionResult(true, null, null);

                case RemoteActionType.LockSession:
                    var locked = _systemActions.LockActiveSession();
                    return locked
                        ? new RemoteActionResult(true, null, null)
                        : new RemoteActionResult(false, null, "No active interactive session found");

                case RemoteActionType.RestartAgent:
                    // Reported as completed BEFORE exiting — the process is about to disappear
                    // and won't get another chance to call the completion endpoint.
                    return new RemoteActionResult(true, null, null);

                default:
                    return new RemoteActionResult(false, null, $"Unknown action type: {action.Type}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Remote action {Type} ({Id}) failed", action.Type, action.Id);
            return new RemoteActionResult(false, null, ex.Message);
        }
    }
}
