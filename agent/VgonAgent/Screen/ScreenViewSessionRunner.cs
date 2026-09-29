using System.IO.Pipes;
using System.Reflection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Http;
using VgonAgent.Identity;
using VgonAgent.Rmm;

namespace VgonAgent.Screen;

/// <summary>
/// Runs one START_SCREEN_VIEW session end to end: launches the capture helper in the active
/// interactive session (which also shows the on-screen notice banner — see
/// <see cref="ScreenViewBannerForm"/>), relays frames it receives over a local named pipe to the
/// Cloud, and stops — on its own timer, when the Cloud's frame-upload response says to, or if the
/// helper disconnects — by killing the helper process and reporting completion. This Agent never
/// reads or could receive mouse/keyboard input for this feature: the pipe is opened
/// <see cref="PipeDirection.In"/> only, one direction, service-reads/helper-writes.
/// </summary>
public sealed class ScreenViewSessionRunner : IScreenViewSessionRunner
{
    private readonly IInteractiveProcessLauncher _launcher;
    private readonly IVgonApiClient _api;
    private readonly IAccessTokenProvider _tokenProvider;
    private readonly AgentOptions _options;
    private readonly ILogger<ScreenViewSessionRunner> _logger;
    private readonly object _lock = new();
    private string? _activeActionId;

    private static readonly string AgentExePath = Environment.ProcessPath
        ?? Path.Combine(AppContext.BaseDirectory, "VgonAgent.exe");
    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    public ScreenViewSessionRunner(
        IInteractiveProcessLauncher launcher,
        IVgonApiClient api,
        IAccessTokenProvider tokenProvider,
        IOptions<AgentOptions> options,
        ILogger<ScreenViewSessionRunner> logger)
    {
        _launcher = launcher;
        _api = api;
        _tokenProvider = tokenProvider;
        _options = options.Value;
        _logger = logger;
    }

    public bool TryStart(string actionId)
    {
        lock (_lock)
        {
            if (_activeActionId is not null)
            {
                _logger.LogWarning("Refusing to start screen view session {ActionId}; {Existing} is already active", actionId, _activeActionId);
                return false;
            }
            _activeActionId = actionId;
        }

        // Deliberately detached from the caller's (short) cancellation token — this legitimately
        // outlives the poll cycle that started it. The Agent's own max-duration timer, not this
        // token, is what eventually ends it.
        _ = Task.Run(() => RunAsync(actionId));
        return true;
    }

    private async Task RunAsync(string actionId)
    {
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        var frameCount = 0;
        System.Diagnostics.Process? helper = null;
        NamedPipeServerStream? pipe = null;

        try
        {
            var pipeName = "VgonScreenView_" + Guid.NewGuid().ToString("N");
            pipe = new NamedPipeServerStream(pipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);

            helper = _launcher.LaunchInActiveSession(AgentExePath, $"--live-view {pipeName} {_options.ScreenViewFrameIntervalMs}");
            if (helper is null)
            {
                await CompleteAsync(actionId, success: false, framesSent: 0, stopwatch, "No active interactive session found");
                return;
            }

            using var connectCts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            try
            {
                await pipe.WaitForConnectionAsync(connectCts.Token);
            }
            catch (OperationCanceledException)
            {
                await CompleteAsync(actionId, success: false, framesSent: 0, stopwatch, "Screen capture helper did not connect in time");
                return;
            }

            var maxDuration = TimeSpan.FromSeconds(_options.ScreenViewMaxDurationSeconds);
            while (stopwatch.Elapsed < maxDuration)
            {
                byte[]? frame;
                using (var frameCts = new CancellationTokenSource(TimeSpan.FromMilliseconds(_options.ScreenViewFrameIntervalMs * 5L)))
                {
                    try
                    {
                        frame = await PipeFraming.ReadFrameAsync(pipe, frameCts.Token);
                    }
                    catch (Exception ex) when (ex is OperationCanceledException or EndOfStreamException or IOException)
                    {
                        break; // helper went stale/died/disconnected — end the session
                    }
                }
                if (frame is null) break; // helper closed the pipe cleanly

                var (_, accessToken) = await _tokenProvider.GetAccessTokenAsync(CancellationToken.None);
                bool shouldContinue;
                try
                {
                    shouldContinue = await _api.UploadScreenFrameAsync(accessToken, actionId, frame, CancellationToken.None);
                }
                catch (VgonApiException ex)
                {
                    _logger.LogWarning(ex, "Screen frame upload failed for session {ActionId}; ending session", actionId);
                    break;
                }
                frameCount++;
                if (!shouldContinue) break;
            }

            await CompleteAsync(actionId, success: true, frameCount, stopwatch, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Screen view session {ActionId} failed", actionId);
            await CompleteAsync(actionId, success: false, frameCount, stopwatch, ex.Message);
        }
        finally
        {
            try { helper?.Kill(entireProcessTree: true); } catch { /* best-effort — it may have already exited */ }
            pipe?.Dispose();
            lock (_lock)
            {
                if (_activeActionId == actionId) _activeActionId = null;
            }
        }
    }

    private async Task CompleteAsync(string actionId, bool success, int framesSent, System.Diagnostics.Stopwatch stopwatch, string? errorMessage)
    {
        try
        {
            var (_, accessToken) = await _tokenProvider.GetAccessTokenAsync(CancellationToken.None);
            await _api.CompleteActionAsync(accessToken, actionId, new CompleteRemoteActionRequest
            {
                Success = success,
                Result = new { framesSent, durationSeconds = (int)stopwatch.Elapsed.TotalSeconds },
                ErrorMessage = errorMessage,
            }, CancellationToken.None);
        }
        catch (Exception ex)
        {
            // The Cloud will still see the action stuck in ACKNOWLEDGED and its stream will time
            // out on its own (max-duration check) — logging is the best we can do here.
            _logger.LogError(ex, "Failed to report completion for screen view session {ActionId}", actionId);
        }
    }
}
