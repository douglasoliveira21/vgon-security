using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Http;
using VgonAgent.Identity;
using VgonAgent.Policy;

namespace VgonAgent.Services;

/// <summary>
/// Section 16: the Agent pulls its effective policy on an interval rather than the Cloud
/// pushing it — simpler (no persistent connection/webhook infra) and self-healing (a missed
/// fetch is just retried next cycle). A failed fetch leaves <see cref="IPolicyStore"/> exactly
/// as it was — the Agent keeps applying the last policy it successfully received.
/// </summary>
public sealed class PolicyRefreshService : BackgroundService
{
    private readonly IPolicyStore _policyStore;
    private readonly IAccessTokenProvider _tokenProvider;
    private readonly IVgonApiClient _api;
    private readonly AgentOptions _options;
    private readonly ILogger<PolicyRefreshService> _logger;

    public PolicyRefreshService(
        IPolicyStore policyStore,
        IAccessTokenProvider tokenProvider,
        IVgonApiClient api,
        IOptions<AgentOptions> options,
        ILogger<PolicyRefreshService> logger)
    {
        _policyStore = policyStore;
        _tokenProvider = tokenProvider;
        _api = api;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var (_, accessToken) = await _tokenProvider.GetAccessTokenAsync(stoppingToken);
                var policy = await _api.GetPolicyAsync(accessToken, stoppingToken);

                if (policy.Version != _policyStore.Current.Version)
                {
                    _logger.LogInformation("Applying updated policy (version {Version})", policy.Version);
                }
                _policyStore.Update(policy);
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
                _logger.LogWarning(ex, "Policy refresh failed; continuing with the last cached policy");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.PolicyRefreshIntervalSeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
