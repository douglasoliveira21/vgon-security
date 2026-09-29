using System.Collections.Concurrent;
using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Collectors.Files;
using VgonAgent.Configuration;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Queue;

namespace VgonAgent.Collectors;

/// <summary>
/// IFileCollector (section 9). Event-driven via FileSystemWatcher rather than polling — cheaper
/// and catches renames/deletes that a periodic directory listing would miss between polls.
/// Watches only a configurable, narrow set of per-user folders (Desktop/Documents/Downloads by
/// default), never whole system directories. Metadata only: file content is never opened.
/// </summary>
public sealed class FileCollector : BackgroundService
{
    private const string CollectorName = "file";
    private static readonly TimeSpan ProfileRefreshInterval = TimeSpan.FromMinutes(5);

    private readonly IEventQueue _queue;
    private readonly ICollectorStatusRegistry _status;
    private readonly IPolicyStore _policyStore;
    private readonly AgentOptions _options;
    private readonly ILogger<FileCollector> _logger;

    private readonly Dictionary<string, (FileSystemWatcher Watcher, string UserName)> _watchers = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> _pendingModified = new();

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    private bool IsEnabled => _policyStore.Current.Collection.FileCollectorEnabled ?? _options.FileCollectorEnabled;

    public FileCollector(
        IEventQueue queue,
        ICollectorStatusRegistry status,
        IPolicyStore policyStore,
        IOptions<AgentOptions> options,
        ILogger<FileCollector> logger)
    {
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
                    DisposeWatchers();
                    _status.Report(CollectorName, CollectorState.STOPPED);
                }
                else
                {
                    RefreshWatchers();
                    _status.Report(CollectorName, CollectorState.RUNNING);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "File collector watcher refresh failed; will retry next cycle");
                _status.Report(CollectorName, CollectorState.ERROR);
            }

            try
            {
                await Task.Delay(ProfileRefreshInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        DisposeWatchers();
        _status.Report(CollectorName, CollectorState.STOPPED);
    }

    private void DisposeWatchers()
    {
        foreach (var (watcher, _) in _watchers.Values)
        {
            watcher.Dispose();
        }
        _watchers.Clear();
    }

    // Re-scans enrolled users so a folder that didn't exist yet (e.g. a user's first login
    // after enrollment) gets picked up without requiring a service restart.
    private void RefreshWatchers()
    {
        var watchFolders = _policyStore.Current.File.WatchFolders ?? _options.FileWatchFolders;
        foreach (var (userName, profileDir) in UserProfiles.Enumerate())
        {
            foreach (var folder in watchFolders)
            {
                var path = Path.Combine(profileDir, folder);
                if (_watchers.ContainsKey(path) || !Directory.Exists(path)) continue;

                try
                {
                    var watcher = new FileSystemWatcher(path)
                    {
                        IncludeSubdirectories = true,
                        NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
                    };
                    watcher.Created += OnCreated;
                    watcher.Changed += OnChanged;
                    watcher.Deleted += OnDeleted;
                    watcher.Renamed += OnRenamed;
                    watcher.Error += OnError;
                    watcher.EnableRaisingEvents = true;

                    _watchers[path] = (watcher, userName);
                    _logger.LogDebug("Watching {Path} for user {User}", path, userName);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Could not watch {Path}", path);
                }
            }
        }
    }

    private void OnCreated(object sender, FileSystemEventArgs e) =>
        SafeHandle(() => Handle(sender, e.FullPath, EventType.FileCreated, previousPath: null));

    private void OnDeleted(object sender, FileSystemEventArgs e) =>
        SafeHandle(() => Handle(sender, e.FullPath, EventType.FileDeleted, previousPath: null));

    private void OnRenamed(object sender, RenamedEventArgs e) =>
        SafeHandle(() => Handle(sender, e.FullPath, EventType.FileRenamed, previousPath: e.OldFullPath));

    private void OnChanged(object sender, FileSystemEventArgs e) => SafeHandle(() =>
    {
        if (Directory.Exists(e.FullPath)) return; // directories also raise Changed; files only
        if (FileEventFilter.ShouldIgnore(e.FullPath, ExcludedExtensions)) return;

        // Collapse the burst of Changed events a single save/write produces into one report.
        var now = DateTimeOffset.UtcNow;
        var debounceWindow = TimeSpan.FromSeconds(_options.FileChangeDebounceSeconds);
        if (_pendingModified.TryGetValue(e.FullPath, out var last) && now - last < debounceWindow) return;
        _pendingModified[e.FullPath] = now;

        Handle(sender, e.FullPath, EventType.FileModified, previousPath: null);
    });

    private void OnError(object sender, ErrorEventArgs e) =>
        _logger.LogWarning(e.GetException(), "File watcher error (likely an internal buffer overflow from a burst of changes)");

    private void SafeHandle(Action action)
    {
        try
        {
            action();
        }
        catch (Exception ex)
        {
            // A single bad callback (e.g. path disappeared mid-handling) must not crash the
            // watcher thread or take collector state down with it.
            _logger.LogDebug(ex, "File event handling failed");
        }
    }

    private List<string> ExcludedExtensions => _policyStore.Current.File.ExcludedExtensions ?? _options.FileExcludedExtensions;

    private void Handle(object sender, string fullPath, string eventType, string? previousPath)
    {
        if (FileEventFilter.ShouldIgnore(fullPath, ExcludedExtensions)) return;

        var userName = sender is FileSystemWatcher watcher && _watchers.Values.Any(v => v.Watcher == watcher)
            ? _watchers.Values.First(v => v.Watcher == watcher).UserName
            : null;

        long? sizeBytes = null;
        if (eventType != EventType.FileDeleted)
        {
            try { sizeBytes = new FileInfo(fullPath).Length; } catch { /* file may already be gone/locked */ }
        }

        var data = new FileEventData
        {
            Path = fullPath,
            Name = Path.GetFileName(fullPath),
            Extension = Path.GetExtension(fullPath) is { Length: > 0 } ext ? ext : null,
            SizeBytes = sizeBytes,
            User = userName,
            PreviousPath = previousPath,
        };

        _queue.EnqueueAsync(new EventEnvelope
        {
            AgentVersion = AgentVersion,
            Timestamp = DateTimeOffset.UtcNow.ToString("O"),
            EventType = eventType,
            Severity = EventSeverity.Info,
            Data = data,
        }, CancellationToken.None).GetAwaiter().GetResult();
    }
}
