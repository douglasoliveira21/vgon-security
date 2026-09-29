using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Collectors.Browser;
using VgonAgent.Configuration;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Queue;

namespace VgonAgent.Collectors;

/// <summary>
/// IBrowserCollector (section 8). Periodically reads each browser's own history database
/// (Chrome/Edge share a schema; Firefox has its own) instead of a browser extension — no
/// extension deployment/store-approval story needed, at the cost of picking up a visit only
/// after the browser writes it to its history file (usually within seconds), not instantly.
/// Never opens a page's content; only reads url/title/timestamp metadata the browser itself
/// already recorded.
/// </summary>
public sealed class BrowserCollector : BackgroundService
{
    private const string CollectorName = "browser";

    private readonly IEventQueue _queue;
    private readonly ICollectorStatusRegistry _status;
    private readonly IPolicyStore _policyStore;
    private readonly AgentOptions _options;
    private readonly ILogger<BrowserCollector> _logger;
    private readonly List<IBrowserHistoryReader> _readers;
    private readonly BrowserCursorStore _cursorStore;
    private readonly string _tempDirectory;
    private int _staleFilesRemovedSinceStart;
    private bool _highLeakRateWarned;

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    private bool IsEnabled => _policyStore.Current.Collection.BrowserCollectorEnabled ?? _options.BrowserCollectorEnabled;
    private string UrlPolicy => _policyStore.Current.Browser.UrlPolicy ?? _options.BrowserUrlPolicy;
    private List<string> SensitiveParams => _policyStore.Current.Browser.SensitiveParams ?? _options.SensitiveUrlParams;

    public BrowserCollector(
        IEventQueue queue,
        ICollectorStatusRegistry status,
        IPolicyStore policyStore,
        IOptions<AgentOptions> options,
        ILogger<BrowserCollector> logger)
    {
        _queue = queue;
        _status = status;
        _policyStore = policyStore;
        _options = options.Value;
        _logger = logger;
        _cursorStore = new BrowserCursorStore(_options.DataDirectory);
        _tempDirectory = Path.Combine(_options.DataDirectory, "browser-cache");

        _readers =
        [
            new ChromiumHistoryReader("Chrome", Path.Combine("Google", "Chrome", "User Data"), logger),
            new ChromiumHistoryReader("Edge", Path.Combine("Microsoft", "Edge", "User Data"), logger),
            new FirefoxHistoryReader(logger),
        ];
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
                _logger.LogError(ex, "Browser collector poll failed; will retry next cycle");
                _status.Report(CollectorName, CollectorState.ERROR);
            }

            try
            {
                var pollInterval = _policyStore.Current.Browser.PollIntervalSeconds ?? _options.BrowserCollectorPollIntervalSeconds;
                await Task.Delay(TimeSpan.FromSeconds(pollInterval), stoppingToken);
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
        SweepStaleTempCopies();

        foreach (var reader in _readers)
        {
            IEnumerable<ProfileHistoryDatabase> databases;
            try
            {
                databases = reader.DiscoverDatabases().ToList();
            }
            catch (Exception ex)
            {
                // e.g. the whole browser isn't installed, or C:\Users isn't enumerable in some
                // locked-down environment — skip this browser this cycle, others still run.
                _logger.LogDebug(ex, "Could not discover {Browser} profiles", reader.BrowserName);
                continue;
            }

            foreach (var database in databases)
            {
                await ProcessDatabaseAsync(reader, database, ct);
            }
        }
    }

    /// <summary>
    /// BrowserHistoryCopier.TryDelete() already removes each temp copy right after it's read, but
    /// silently swallows any failure to do so (e.g. antivirus real-time scanning holding a
    /// transient lock on a freshly-written .sqlite file) — that's the right call for a single
    /// delete, but with nothing else backstopping it, a persistent failure mode there
    /// accumulates one orphaned copy (hundreds of KB to several MB each) every poll cycle,
    /// forever, until the disk fills up. This sweep is that backstop: anything left over from
    /// more than a few cycles ago gets removed here regardless of why the immediate delete
    /// didn't take.
    /// </summary>
    private void SweepStaleTempCopies()
    {
        try
        {
            if (!Directory.Exists(_tempDirectory)) return;

            var cutoff = DateTime.UtcNow.AddMinutes(-5);
            var removed = 0;
            foreach (var file in Directory.EnumerateFiles(_tempDirectory))
            {
                try
                {
                    if (File.GetLastWriteTimeUtc(file) < cutoff)
                    {
                        File.Delete(file);
                        removed++;
                    }
                }
                catch
                {
                    // Still locked or already gone — next sweep gets another chance.
                }
            }

            // Logged at Debug, not Warning: on a machine where the immediate delete keeps missing
            // (see the doc comment above), this would otherwise fire every single poll cycle
            // forever and drown out every other collector's log output — see the one-time-per-
            // restart warning below instead, which is what should actually get attention.
            if (removed > 0)
            {
                _logger.LogDebug("Removed {Count} stale browser-cache temp file(s) older than 5 minutes", removed);
                _staleFilesRemovedSinceStart += removed;
                if (_staleFilesRemovedSinceStart >= 200 && !_highLeakRateWarned)
                {
                    _highLeakRateWarned = true;
                    _logger.LogWarning(
                        "Removed {Count} stale browser-cache temp files since the Agent started — the " +
                        "immediate delete-after-use in BrowserHistoryCopier is failing persistently, not " +
                        "just occasionally (e.g. antivirus locking freshly-copied .sqlite files). The 5-minute " +
                        "sweep is keeping the disk safe, but this is worth investigating.",
                        _staleFilesRemovedSinceStart);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "browser-cache cleanup sweep failed; will retry next cycle");
        }
    }

    private async Task ProcessDatabaseAsync(IBrowserHistoryReader reader, ProfileHistoryDatabase database, CancellationToken ct)
    {
        try
        {
            // First time we see this profile: start from "now" rather than the user's entire
            // history, so enrolling a device doesn't flood the queue with years of past browsing.
            // The baseline must be persisted right away: if it were only saved once a visit is found,
            // every poll would recompute "now" as the baseline and never see anything newer than it.
            if (!_cursorStore.HasCursor(database.DatabasePath))
            {
                _cursorStore.SetCursor(database.DatabasePath, DateTimeOffset.UtcNow);
            }

            var since = _cursorStore.GetCursor(database.DatabasePath, DateTimeOffset.UtcNow);
            var visits = reader.ReadVisitsSince(database, since, _tempDirectory);
            if (visits.Count == 0) return;

            var maxSeen = since;
            foreach (var visit in visits)
            {
                var urlPolicy = UrlPolicy;
                var sanitized = UrlSanitizer.Apply(visit.Url, urlPolicy, SensitiveParams);
                var includeTitle = urlPolicy != Models.BrowserUrlPolicy.DomainOnly;

                var data = new BrowserEventData
                {
                    Browser = database.BrowserName,
                    Url = sanitized.Url,
                    Domain = sanitized.Domain,
                    Title = includeTitle ? visit.Title : null,
                    User = database.UserName,
                    VisitedAt = visit.VisitedAt.ToString("O"),
                };

                await _queue.EnqueueAsync(new EventEnvelope
                {
                    AgentVersion = AgentVersion,
                    Timestamp = DateTimeOffset.UtcNow.ToString("O"),
                    EventType = EventType.BrowserNavigation,
                    Severity = EventSeverity.Info,
                    Data = data,
                }, ct);

                if (visit.VisitedAt > maxSeen) maxSeen = visit.VisitedAt;
            }

            _cursorStore.SetCursor(database.DatabasePath, maxSeen);
        }
        catch (Exception ex)
        {
            // One user's locked/corrupt profile must not stop other profiles or other browsers.
            _logger.LogDebug(ex, "Failed reading {Browser} history for user {User}", reader.BrowserName, database.UserName);
        }
    }
}
