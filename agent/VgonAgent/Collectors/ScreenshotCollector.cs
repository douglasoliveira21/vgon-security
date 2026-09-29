using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Http;
using VgonAgent.Identity;
using VgonAgent.Policy;
using VgonAgent.Rmm;
using VgonAgent.Screen;

namespace VgonAgent.Collectors;

/// <summary>
/// Periodic, silent screenshot capture (default every 60s — see AgentOptions.ScreenshotIntervalSeconds).
/// Silent and on a fixed interval is what distinguishes this from the live screen-view RMM action,
/// which always shows an on-screen notice for its duration — see ScreenViewSessionRunner.
/// Like every other collector, a capture failure (no interactive session logged on, helper
/// launch failed, upload error) just skips this cycle rather than taking the service down.
/// </summary>
public sealed class ScreenshotCollector : BackgroundService
{
    private const string CollectorName = "screenshot";
    private static readonly TimeSpan HelperTimeout = TimeSpan.FromSeconds(10);

    private readonly IInteractiveProcessLauncher _launcher;
    private readonly IVgonApiClient _api;
    private readonly IAccessTokenProvider _tokenProvider;
    private readonly ICollectorStatusRegistry _status;
    private readonly IPolicyStore _policyStore;
    private readonly AgentOptions _options;
    private readonly ILogger<ScreenshotCollector> _logger;

    private bool IsEnabled => _policyStore.Current.Collection.ScreenshotCollectorEnabled ?? _options.ScreenshotCollectorEnabled;

    public ScreenshotCollector(
        IInteractiveProcessLauncher launcher,
        IVgonApiClient api,
        IAccessTokenProvider tokenProvider,
        ICollectorStatusRegistry status,
        IPolicyStore policyStore,
        IOptions<AgentOptions> options,
        ILogger<ScreenshotCollector> logger)
    {
        _launcher = launcher;
        _api = api;
        _tokenProvider = tokenProvider;
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
                    await CaptureOnceAsync(stoppingToken);
                    _status.Report(CollectorName, CollectorState.RUNNING);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Screenshot capture failed; will retry next cycle");
                _status.Report(CollectorName, CollectorState.ERROR);
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.ScreenshotIntervalSeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _status.Report(CollectorName, CollectorState.STOPPED);
    }

    private async Task CaptureOnceAsync(CancellationToken ct)
    {
        var tempFile = Path.Combine(Path.GetTempPath(), $"vgon-screenshot-{Guid.NewGuid():N}.jpg");
        System.Diagnostics.Process? helper = null;
        try
        {
            var agentExe = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "VgonAgent.exe");
            helper = _launcher.LaunchInActiveSession(agentExe, $"--capture-once \"{tempFile}\"");
            if (helper is null)
            {
                _logger.LogDebug("No active interactive session; skipping this screenshot cycle");
                return;
            }

            using var timeoutCts = new CancellationTokenSource(HelperTimeout);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);
            try
            {
                await helper.WaitForExitAsync(linked.Token);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                _logger.LogWarning("Screenshot capture helper did not exit in time; skipping this cycle");
                return;
            }

            if (helper.ExitCode != 0 || !File.Exists(tempFile))
            {
                _logger.LogDebug("Screenshot capture helper exited with code {Code}; skipping this cycle", helper.ExitCode);
                return;
            }

            var bytes = await File.ReadAllBytesAsync(tempFile, ct);
            var (_, accessToken) = await _tokenProvider.GetAccessTokenAsync(ct);
            await _api.UploadScreenshotAsync(accessToken, bytes, DateTimeOffset.UtcNow, width: null, height: null, ct);
        }
        finally
        {
            try { if (File.Exists(tempFile)) File.Delete(tempFile); } catch { /* best-effort cleanup */ }
            try { helper?.Dispose(); } catch { /* best-effort cleanup */ }
        }
    }
}
