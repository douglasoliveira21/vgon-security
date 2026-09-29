using System.Diagnostics;
using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Queue;

namespace VgonAgent.Collectors;

/// <summary>
/// IProcessCollector (section 6/7). Detects process start/stop by polling the process table —
/// simpler and more portable than a WMI event trace (which needs elevated ETW permissions),
/// at the cost of missing very short-lived processes between polls and exact exit codes
/// (a polling snapshot doesn't hold a Process handle open to read ExitCode later).
/// A failure here is caught and logged, never allowed to take down the Worker Service.
/// </summary>
public sealed class ProcessCollector : BackgroundService
{
    private const string CollectorName = "process";

    private readonly IEventQueue _queue;
    private readonly ICollectorStatusRegistry _status;
    private readonly IPolicyStore _policyStore;
    private readonly AgentOptions _options;
    private readonly ILogger<ProcessCollector> _logger;

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    private Dictionary<int, ProcessSnapshot> _lastSnapshot = new();

    // Section 16 CollectionPolicy: a server-pushed override wins; with none configured, falls
    // back to the Agent's own local appsettings.json default — unchanged behavior pre-Phase 6.
    private bool IsEnabled => _policyStore.Current.Collection.ProcessCollectorEnabled ?? _options.ProcessCollectorEnabled;

    // ApplicationPolicy's suspicious-process denylist, same fallback rule.
    private HashSet<string> SuspiciousNames => new(
        _policyStore.Current.Application.SuspiciousProcessNames ?? _options.SuspiciousProcessNames,
        StringComparer.OrdinalIgnoreCase);

    public ProcessCollector(
        IEventQueue queue,
        ICollectorStatusRegistry status,
        IPolicyStore policyStore,
        IOptions<AgentOptions> options,
        ILogger<ProcessCollector> logger)
    {
        _queue = queue;
        _status = status;
        _policyStore = policyStore;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!IsEnabled)
        {
            _status.Report(CollectorName, CollectorState.STOPPED);
        }
        else
        {
            _lastSnapshot = TakeSnapshot();
            _status.Report(CollectorName, CollectorState.RUNNING);
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.ProcessCollectorPollIntervalSeconds), stoppingToken);

                if (!IsEnabled)
                {
                    _status.Report(CollectorName, CollectorState.STOPPED);
                    _lastSnapshot = new(); // re-enabling later starts a fresh baseline, no stale-diff flood
                    continue;
                }

                await PollOnceAsync(stoppingToken);
                _status.Report(CollectorName, CollectorState.RUNNING);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Never let one bad poll cycle kill the collector loop (section 6: collector
                // failures must not take down the Agent).
                _logger.LogError(ex, "Process collector poll failed; will retry next cycle");
                _status.Report(CollectorName, CollectorState.ERROR);
            }
        }

        _status.Report(CollectorName, CollectorState.STOPPED);
    }

    private async Task PollOnceAsync(CancellationToken ct)
    {
        var current = TakeSnapshot();
        var now = DateTimeOffset.UtcNow.ToString("O");
        var suspiciousNames = SuspiciousNames;

        foreach (var (pid, info) in current)
        {
            if (_lastSnapshot.ContainsKey(pid)) continue; // already known

            var isSuspicious = suspiciousNames.Contains(info.Name);
            var data = new ProcessEventData
            {
                Pid = pid,
                ProcessName = info.Name,
                Path = info.Path,
                StartedAt = (info.StartTime ?? DateTimeOffset.UtcNow).ToString("O"),
                Suspicious = isSuspicious,
                SuspiciousReason = isSuspicious ? "Process name matches configured watchlist" : null,
            };

            await _queue.EnqueueAsync(new EventEnvelope
            {
                AgentVersion = AgentVersion,
                Timestamp = now,
                EventType = EventType.ProcessStarted,
                Severity = isSuspicious ? EventSeverity.High : EventSeverity.Info,
                Data = data,
            }, ct);
        }

        foreach (var (pid, info) in _lastSnapshot)
        {
            if (current.ContainsKey(pid)) continue; // still running

            var data = new ProcessEventData
            {
                Pid = pid,
                ProcessName = info.Name,
                Path = info.Path,
                StoppedAt = now,
            };

            await _queue.EnqueueAsync(new EventEnvelope
            {
                AgentVersion = AgentVersion,
                Timestamp = now,
                EventType = EventType.ProcessStopped,
                Severity = EventSeverity.Info,
                Data = data,
            }, ct);
        }

        _lastSnapshot = current;
    }

    private Dictionary<int, ProcessSnapshot> TakeSnapshot()
    {
        var snapshot = new Dictionary<int, ProcessSnapshot>();
        foreach (var process in Process.GetProcesses())
        {
            using (process)
            {
                try
                {
                    // MainModule access throws Win32Exception for protected/system processes when
                    // the Agent isn't elevated enough — that's expected; fall back to name only.
                    string? path = null;
                    try { path = process.MainModule?.FileName; } catch { /* access denied, expected for some processes */ }

                    snapshot[process.Id] = new ProcessSnapshot(process.ProcessName + ".exe", path, SafeStartTime(process));
                }
                catch
                {
                    // Process exited between enumeration and inspection — skip it, it'll show
                    // up as a "stopped" on the next cycle only if it was seen in a prior snapshot.
                }
            }
        }
        return snapshot;
    }

    private static DateTimeOffset? SafeStartTime(Process process)
    {
        try { return process.StartTime; } catch { return null; }
    }

    private sealed record ProcessSnapshot(string Name, string? Path, DateTimeOffset? StartTime);
}
