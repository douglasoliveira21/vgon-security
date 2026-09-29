using System.Diagnostics;
using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Http;
using VgonAgent.Identity;
using VgonAgent.Update;

namespace VgonAgent.Services;

/// <summary>
/// Agent auto-update (section 24): checks the configured release channel, and if a newer,
/// checksum-verified version is available, stages it and hands off to a generated PowerShell
/// script that performs the actual stop/backup/swap/start/rollback sequence in a separate
/// process (see UpdateScriptBuilder — a running .exe can't replace its own file).
/// </summary>
public sealed class AgentUpdateService : BackgroundService
{
    private const string ServiceName = "VgonSecurityPlusAgent";

    private readonly IVgonApiClient _api;
    private readonly IAccessTokenProvider _tokenProvider;
    private readonly HttpClient _downloadClient;
    private readonly AgentOptions _options;
    private readonly ILogger<AgentUpdateService> _logger;

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    public AgentUpdateService(
        IVgonApiClient api,
        IAccessTokenProvider tokenProvider,
        IHttpClientFactory httpClientFactory,
        IOptions<AgentOptions> options,
        ILogger<AgentUpdateService> logger)
    {
        _api = api;
        _tokenProvider = tokenProvider;
        // A separate, un-based-address client: release downloadUrls point at wherever the
        // release artifact is hosted (a CDN, object storage, ...), not the API itself.
        _downloadClient = httpClientFactory.CreateClient("agent-update-download");
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_options.UpdatesEnabled)
                {
                    await CheckAndApplyAsync(stoppingToken);
                }
            }
            catch (VgonApiException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                _tokenProvider.Invalidate();
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Update check failed; will retry next cycle");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.UpdateCheckIntervalSeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task CheckAndApplyAsync(CancellationToken ct)
    {
        var (_, accessToken) = await _tokenProvider.GetAccessTokenAsync(ct);
        var release = await _api.GetLatestReleaseAsync(accessToken, _options.UpdateChannel, ct);

        if (release is null)
        {
            _logger.LogDebug("No release published on channel {Channel}", _options.UpdateChannel);
            return;
        }

        if (!SemVer.IsNewer(release.Version, AgentVersion))
        {
            _logger.LogDebug("Already up to date ({Current}, latest on {Channel} is {Latest})", AgentVersion, _options.UpdateChannel, release.Version);
            return;
        }

        _logger.LogInformation("New Agent version available: {Version} (current: {Current})", release.Version, AgentVersion);

        var content = await _downloadClient.GetByteArrayAsync(release.DownloadUrl, ct);

        if (!UpdatePackageVerifier.VerifySha256(content, release.Sha256))
        {
            // This is a security-relevant event: a checksum mismatch means the downloaded bytes
            // don't match what the Cloud told us to expect. Never install it.
            _logger.LogError(
                "SECURITY: downloaded update {Version} failed SHA-256 verification (expected {Expected}) — refusing to install",
                release.Version, release.Sha256);
            return;
        }

        _logger.LogInformation("Update {Version} passed integrity verification; staging", release.Version);

        var stageDir = Path.Combine(_options.DataDirectory, "updates", release.Version);
        Directory.CreateDirectory(stageDir);
        var stagedZipPath = Path.Combine(stageDir, "package.zip");
        await File.WriteAllBytesAsync(stagedZipPath, content, ct);

        var installDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        var backupDir = Path.Combine(_options.DataDirectory, "updates", $"backup-{AgentVersion}-{DateTime.UtcNow:yyyyMMddHHmmss}");
        var scriptPath = Path.Combine(stageDir, "apply-update.ps1");
        await File.WriteAllTextAsync(scriptPath, UpdateScriptBuilder.Build(ServiceName, installDir, stagedZipPath, backupDir), ct);

        _logger.LogInformation("Update installer staged at {ScriptPath}; launching", scriptPath);
        LaunchInstaller(scriptPath);
    }

    private void LaunchInstaller(string scriptPath)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{scriptPath}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to launch update installer script");
        }
    }
}
