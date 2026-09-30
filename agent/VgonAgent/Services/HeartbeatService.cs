using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Collectors;
using VgonAgent.Configuration;
using VgonAgent.Http;
using VgonAgent.Identity;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Rmm;

namespace VgonAgent.Services;

/// <summary>Section 15: periodic heartbeat so the Cloud can derive ONLINE/STALE/OFFLINE.</summary>
public sealed class HeartbeatService : BackgroundService
{
    private readonly IAccessTokenProvider _tokenProvider;
    private readonly IVgonApiClient _api;
    private readonly ICollectorStatusRegistry _collectorStatus;
    private readonly IPolicyStore _policyStore;
    private readonly AgentOptions _options;
    private readonly ILogger<HeartbeatService> _logger;

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    public HeartbeatService(
        IAccessTokenProvider tokenProvider,
        IVgonApiClient api,
        ICollectorStatusRegistry collectorStatus,
        IPolicyStore policyStore,
        IOptions<AgentOptions> options,
        ILogger<HeartbeatService> logger)
    {
        _tokenProvider = tokenProvider;
        _api = api;
        _collectorStatus = collectorStatus;
        _policyStore = policyStore;
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

                await _api.SendHeartbeatAsync(accessToken, new HeartbeatRequest
                {
                    AgentVersion = AgentVersion,
                    Os = RuntimeInformation.OSDescription,
                    CollectorStatus = _collectorStatus.Snapshot() as Dictionary<string, string>
                        ?? new Dictionary<string, string>(_collectorStatus.Snapshot()),
                    PolicyVersion = _policyStore.Current.Version.ToString(),
                    LoggedInUser = ActiveSessionLocator.GetActiveSessionUserName(),
                }, stoppingToken);

                _logger.LogDebug("Heartbeat sent");
            }
            catch (VgonApiException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                _logger.LogWarning("Heartbeat rejected (401); invalidating cached access token");
                _tokenProvider.Invalidate();
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Heartbeat failed; will retry next interval");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.HeartbeatIntervalSeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
