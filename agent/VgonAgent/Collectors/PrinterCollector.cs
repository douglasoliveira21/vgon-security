using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Collectors.Printing;
using VgonAgent.Configuration;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Queue;

namespace VgonAgent.Collectors;

/// <summary>
/// IPrinterCollector (section 11). Polls the print spooler's job queue via WMI and reports a
/// job the first time it's seen — jobs disappear once printed, so "new appearance" is the
/// natural signal, there's no separate "completed" event to wait for. Document content is
/// never read; only the metadata the spooler itself already exposes.
/// </summary>
public sealed class PrinterCollector : BackgroundService
{
    private const string CollectorName = "printer";

    private readonly IPrintJobEnumerator _enumerator;
    private readonly IEventQueue _queue;
    private readonly ICollectorStatusRegistry _status;
    private readonly IPolicyStore _policyStore;
    private readonly AgentOptions _options;
    private readonly ILogger<PrinterCollector> _logger;

    private HashSet<string> _lastSeenJobKeys = [];

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    private bool IsEnabled => _policyStore.Current.Collection.PrinterCollectorEnabled ?? _options.PrinterCollectorEnabled;

    public PrinterCollector(
        IPrintJobEnumerator enumerator,
        IEventQueue queue,
        ICollectorStatusRegistry status,
        IPolicyStore policyStore,
        IOptions<AgentOptions> options,
        ILogger<PrinterCollector> logger)
    {
        _enumerator = enumerator;
        _queue = queue;
        _status = status;
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
                _logger.LogError(ex, "Printer collector poll failed; will retry next cycle");
                _status.Report(CollectorName, CollectorState.ERROR);
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.PrinterCollectorPollIntervalSeconds), stoppingToken);
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
        var jobs = _enumerator.Enumerate().ToList();
        var currentKeys = jobs.Select(j => j.JobKey).ToHashSet();

        foreach (var job in jobs)
        {
            if (_lastSeenJobKeys.Contains(job.JobKey)) continue;

            var data = new PrinterEventData
            {
                PrinterName = job.PrinterName,
                DocumentName = job.DocumentName,
                User = job.Owner,
                Pages = job.Pages,
                SizeBytes = job.SizeBytes,
            };

            await _queue.EnqueueAsync(new EventEnvelope
            {
                AgentVersion = AgentVersion,
                Timestamp = DateTimeOffset.UtcNow.ToString("O"),
                EventType = EventType.PrintJob,
                Severity = EventSeverity.Info,
                Data = data,
            }, ct);
        }

        _lastSeenJobKeys = currentKeys;
    }
}
