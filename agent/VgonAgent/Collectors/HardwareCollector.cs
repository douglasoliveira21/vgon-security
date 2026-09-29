using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Collectors.Hardware;
using VgonAgent.Configuration;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Queue;
using VgonAgent.Rmm;

namespace VgonAgent.Collectors;

/// <summary>
/// IHardwareCollector (section 12). Hardware essentially never changes at runtime, so unlike the
/// other collectors this sends its full (small, fixed-shape) snapshot on every run rather than
/// diffing — there's no meaningful "incremental" version of "what CPU does this machine have".
/// </summary>
public sealed class HardwareCollector : BackgroundService
{
    private const string CollectorName = "hardware";

    private readonly IHardwareInfoReader _reader;
    private readonly IEventQueue _queue;
    private readonly ICollectorStatusRegistry _status;
    private readonly IPolicyStore _policyStore;
    private readonly ICollectionTrigger _trigger;
    private readonly AgentOptions _options;
    private readonly ILogger<HardwareCollector> _logger;

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    private bool IsEnabled => _policyStore.Current.Collection.HardwareCollectorEnabled ?? _options.HardwareCollectorEnabled;

    public HardwareCollector(
        IHardwareInfoReader reader,
        IEventQueue queue,
        ICollectorStatusRegistry status,
        IPolicyStore policyStore,
        ICollectionTrigger trigger,
        IOptions<AgentOptions> options,
        ILogger<HardwareCollector> logger)
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
                        EventType = EventType.HardwareInventory,
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
                _logger.LogError(ex, "Hardware inventory collection failed; will retry next cycle");
                _status.Report(CollectorName, CollectorState.ERROR);
            }

            try
            {
                await _trigger.WaitOrDelayAsync(CollectorName, TimeSpan.FromSeconds(_options.HardwareCollectorIntervalSeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _status.Report(CollectorName, CollectorState.STOPPED);
    }
}
