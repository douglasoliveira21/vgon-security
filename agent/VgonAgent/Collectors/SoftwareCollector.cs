using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Collectors.Software;
using VgonAgent.Configuration;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Queue;
using VgonAgent.Rmm;

namespace VgonAgent.Collectors;

/// <summary>
/// ISoftwareCollector (section 12). Reads the full installed-software list, diffs it against
/// the last snapshot (persisted across restarts via <see cref="SoftwareSnapshotStore"/>), and
/// only enqueues an event when something actually changed — the first-ever run's "added" list
/// IS the full initial inventory, exactly once.
/// </summary>
public sealed class SoftwareCollector : BackgroundService
{
    private const string CollectorName = "software";

    private readonly IInstalledSoftwareReader _reader;
    private readonly IEventQueue _queue;
    private readonly ICollectorStatusRegistry _status;
    private readonly IPolicyStore _policyStore;
    private readonly ICollectionTrigger _trigger;
    private readonly AgentOptions _options;
    private readonly ILogger<SoftwareCollector> _logger;
    private readonly SoftwareSnapshotStore _snapshotStore;

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    private bool IsEnabled => _policyStore.Current.Collection.SoftwareCollectorEnabled ?? _options.SoftwareCollectorEnabled;

    public SoftwareCollector(
        IInstalledSoftwareReader reader,
        IEventQueue queue,
        ICollectorStatusRegistry status,
        IPolicyStore policyStore,
        ICollectionTrigger trigger,
        IOptions<AgentOptions> options,
        ILogger<SoftwareCollector> logger)
    {
        _reader = reader;
        _queue = queue;
        _status = status;
        _policyStore = policyStore;
        _trigger = trigger;
        _options = options.Value;
        _logger = logger;
        _snapshotStore = new SoftwareSnapshotStore(_options.DataDirectory);
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
                    await PollOnceAsync(stoppingToken);
                    _status.Report(CollectorName, CollectorState.RUNNING);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Software inventory collection failed; will retry next cycle");
                _status.Report(CollectorName, CollectorState.ERROR);
            }

            try
            {
                await _trigger.WaitOrDelayAsync(CollectorName, TimeSpan.FromSeconds(_options.SoftwareCollectorIntervalSeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _status.Report(CollectorName, CollectorState.STOPPED);
    }

    private async Task PollOnceAsync(CancellationToken ct)
    {
        var current = _reader.Enumerate();
        var previous = _snapshotStore.Load();
        var diff = SoftwareDiffer.Diff(current, previous);

        if (diff.Added.Count == 0 && diff.Removed.Count == 0)
        {
            return;
        }

        await _queue.EnqueueAsync(new EventEnvelope
        {
            AgentVersion = AgentVersion,
            Timestamp = DateTimeOffset.UtcNow.ToString("O"),
            EventType = EventType.SoftwareInventory,
            Severity = EventSeverity.Info,
            Data = new SoftwareInventoryData { Added = diff.Added, Removed = diff.Removed },
        }, ct);

        _logger.LogInformation("Software inventory delta: +{Added} / -{Removed}", diff.Added.Count, diff.Removed.Count);
        _snapshotStore.Save(current);
    }
}
