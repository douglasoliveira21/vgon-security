using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Http;
using VgonAgent.Models;

namespace VgonAgent.Identity;

/// <summary>
/// Owns the device's identity lifecycle (section 4): registers once using a provisioning
/// token, then rotates the refresh token on every renewal and keeps the short-lived access
/// token cached in memory only (never written to disk — only the refresh token is persisted,
/// and only via DPAPI).
/// </summary>
public sealed class AccessTokenProvider : IAccessTokenProvider
{
    private readonly IVgonApiClient _api;
    private readonly ICredentialStore _credentialStore;
    private readonly AgentOptions _options;
    private readonly ILogger<AccessTokenProvider> _logger;
    private readonly SemaphoreSlim _lock = new(1, 1);

    private string? _deviceId;
    private string? _accessToken;
    private DateTimeOffset _accessTokenExpiresAt = DateTimeOffset.MinValue;

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    public AccessTokenProvider(
        IVgonApiClient api,
        ICredentialStore credentialStore,
        IOptions<AgentOptions> options,
        ILogger<AccessTokenProvider> logger)
    {
        _api = api;
        _credentialStore = credentialStore;
        _options = options.Value;
        _logger = logger;
    }

    public void Invalidate() => _accessTokenExpiresAt = DateTimeOffset.MinValue;

    private bool IsCachedTokenValid() =>
        _accessToken is not null && _deviceId is not null && DateTimeOffset.UtcNow.AddSeconds(30) < _accessTokenExpiresAt;

    public async Task<(string DeviceId, string AccessToken)> GetAccessTokenAsync(CancellationToken ct)
    {
        // 30s safety buffer so a token doesn't expire mid-flight on a slow request.
        // Written as UtcNow + buffer < expiry (rather than expiry - buffer) so Invalidate()'s
        // DateTimeOffset.MinValue sentinel can never underflow when subtracting the buffer.
        if (IsCachedTokenValid())
        {
            return (_deviceId!, _accessToken!);
        }

        await _lock.WaitAsync(ct);
        try
        {
            if (IsCachedTokenValid())
            {
                return (_deviceId!, _accessToken!);
            }

            var credentials = _credentialStore.Load();
            DeviceTokenResponse tokenResponse;

            if (credentials is null)
            {
                tokenResponse = await RegisterAsync(ct);
            }
            else
            {
                try
                {
                    tokenResponse = await _api.RefreshAsync(
                        new RefreshTokenRequest { DeviceId = credentials.DeviceId, RefreshToken = credentials.RefreshToken }, ct);
                }
                catch (VgonApiException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    // Refresh token rejected (revoked device, expired, or replay detected) —
                    // clear the stale credential. Re-registration requires a fresh provisioning
                    // token from an admin; the Agent does not silently self-re-enroll.
                    _logger.LogError("Refresh token rejected by server; device credential cleared. Re-provisioning is required.");
                    _credentialStore.Clear();
                    throw;
                }
            }

            _deviceId = tokenResponse.DeviceId ?? credentials?.DeviceId
                ?? throw new InvalidOperationException("Server did not return a deviceId");
            _accessToken = tokenResponse.AccessToken;
            _accessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(tokenResponse.ExpiresIn);

            _credentialStore.Save(new DeviceCredentials(_deviceId, tokenResponse.RefreshToken));

            return (_deviceId, _accessToken);
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<DeviceTokenResponse> RegisterAsync(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_options.ProvisioningToken))
        {
            throw new InvalidOperationException(
                "No device credential on disk and no ProvisioningToken configured. " +
                "Generate one in the dashboard (Devices -> Generate provisioning token) and set it via " +
                "Agent:ProvisioningToken (appsettings.json) or the VGON_AGENT__PROVISIONINGTOKEN environment variable.");
        }

        _logger.LogInformation("No local device credential found; registering with provisioning token.");

        var response = await _api.RegisterAsync(new RegisterDeviceRequest
        {
            ProvisioningToken = _options.ProvisioningToken,
            Hostname = Environment.MachineName,
            AgentVersion = AgentVersion,
            Os = "Windows",
            OsVersion = RuntimeInformation.OSDescription,
        }, ct);

        _logger.LogInformation("Registered as device {DeviceId}", response.DeviceId);
        return response;
    }
}
