using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Collectors.Security;
using VgonAgent.Configuration;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Queue;
using VgonAgent.Rmm;

namespace VgonAgent.Collectors;

/// <summary>
/// ISecurityCollector (section 13). Reports the device's security posture on a fixed interval;
/// the Cloud's SecurityEvaluatorService (apps/api/src/inventory) is what turns this into open
/// Security Findings — the Agent's job here ends at accurately reporting state.
/// </summary>
public sealed class SecurityCollector : BackgroundService
{
    private const string CollectorName = "security";

    private readonly ISecurityStateReader _reader;
    private readonly IEventQueue _queue;
    private readonly ICollectorStatusRegistry _status;
    private readonly IPolicyStore _policyStore;
    private readonly ICollectionTrigger _trigger;
    private readonly AgentOptions _options;
    private readonly ILogger<SecurityCollector> _logger;

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    private bool IsEnabled => _policyStore.Current.Collection.SecurityCollectorEnabled ?? _options.SecurityCollectorEnabled;

    public SecurityCollector(
        ISecurityStateReader reader,
        IEventQueue queue,
        ICollectorStatusRegistry status,
        IPolicyStore policyStore,
        ICollectionTrigger trigger,
        IOptions<AgentOptions> options,
        ILogger<SecurityCollector> logger)
    {
        _reader = reader;
        _queue = queue;
        _status = status;
        _policyStore = policyStore;
        _trigger = trigger;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!IsEnabled)
                {
                    _status.Report(CollectorName, CollectorState.STOPPED);
                }
                else
                {
                    var data = _reader.Read();
                    await _queue.EnqueueAsync(new EventEnvelope
                    {
                        AgentVersion = AgentVersion,
                        Timestamp = DateTimeOffset.UtcNow.ToString("O"),
                        EventType = EventType.SecurityState,
                        Severity = EventSeverity.Info,
                        Data = data,
                    }, stoppingToken);
                    _status.Report(CollectorName, CollectorState.RUNNING);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Security state collection failed; will retry next cycle");
                _status.Report(CollectorName, CollectorState.ERROR);
            }

            try
            {
                var interval = _policyStore.Current.Security.CollectorIntervalSeconds ?? _options.SecurityCollectorIntervalSeconds;
                await _trigger.WaitOrDelayAsync(CollectorName, TimeSpan.FromSeconds(interval), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _status.Report(CollectorName, CollectorState.STOPPED);
    }
}
