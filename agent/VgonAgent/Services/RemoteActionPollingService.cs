using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Http;
using VgonAgent.Identity;
using VgonAgent.Rmm;

namespace VgonAgent.Services;

/// <summary>Polls for and executes pending RMM remote actions (section 26/Phase 7). RESTART_AGENT
/// is handled specially: the process exits after reporting completion, so it never gets to
/// process a second action in the same batch — that's fine, the rest resume after restart.</summary>
public sealed class RemoteActionPollingService : BackgroundService
{
    private readonly IVgonApiClient _api;
    private readonly IAccessTokenProvider _tokenProvider;
    private readonly RemoteActionExecutor _executor;
    private readonly ISystemActions _systemActions;
    private readonly AgentOptions _options;
    private readonly ILogger<RemoteActionPollingService> _logger;

    public RemoteActionPollingService(
        IVgonApiClient api,
        IAccessTokenProvider tokenProvider,
        RemoteActionExecutor executor,
        ISystemActions systemActions,
        IOptions<AgentOptions> options,
        ILogger<RemoteActionPollingService> logger)
    {
        _api = api;
        _tokenProvider = tokenProvider;
        _executor = executor;
        _systemActions = systemActions;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PollOnceAsync(stoppingToken);
            }
            catch (VgonApiException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                _tokenProvider.Invalidate();
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Remote action poll failed; will retry next cycle");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.RemoteActionPollIntervalSeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task PollOnceAsync(CancellationToken ct)
    {
        var (_, accessToken) = await _tokenProvider.GetAccessTokenAsync(ct);
        var pending = await _api.GetPendingActionsAsync(accessToken, ct);

        foreach (var action in pending)
        {
            _logger.LogInformation("Executing remote action {Type} ({Id})", action.Type, action.Id);
            var result = await _executor.ExecuteAsync(action, ct);

            // Deferred (currently only START_SCREEN_VIEW): a background session owns reporting
            // its own outcome, minutes from now — completing it here too would end the session
            // on its very first poll cycle instead of when it actually finishes.
            if (!result.Deferred)
            {
                await _api.CompleteActionAsync(accessToken, action.Id, new CompleteRemoteActionRequest
                {
                    Success = result.Success,
                    Result = result.Result,
                    ErrorMessage = result.ErrorMessage,
                }, ct);
            }

            if (action.Type == RemoteActionType.RestartAgent)
            {
                _systemActions.ExitForRestart();
            }
        }
    }
}
