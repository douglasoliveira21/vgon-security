using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Http;
using VgonAgent.Identity;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Rmm;

namespace VgonAgent.Tests;

public sealed class FakeCredentialStore : ICredentialStore
{
    public DeviceCredentials? Stored { get; private set; }
    public int SaveCount { get; private set; }

    public DeviceCredentials? Load() => Stored;
    public void Save(DeviceCredentials credentials) { Stored = credentials; SaveCount++; }
    public void Clear() => Stored = null;
}

public sealed class FakeVgonApiClient : IVgonApiClient
{
    public int RegisterCalls { get; private set; }
    public int RefreshCalls { get; private set; }

    public Task<DeviceTokenResponse> RegisterAsync(RegisterDeviceRequest request, CancellationToken ct)
    {
        RegisterCalls++;
        return Task.FromResult(new DeviceTokenResponse
        {
            DeviceId = "device-1",
            AccessToken = "access-token-from-register",
            RefreshToken = "refresh-token-1",
            ExpiresIn = 600,
        });
    }

    public Task<DeviceTokenResponse> RefreshAsync(RefreshTokenRequest request, CancellationToken ct)
    {
        RefreshCalls++;
        return Task.FromResult(new DeviceTokenResponse
        {
            AccessToken = $"access-token-from-refresh-{RefreshCalls}",
            RefreshToken = $"refresh-token-{RefreshCalls + 1}",
            ExpiresIn = 600,
        });
    }

    public Task SendHeartbeatAsync(string accessToken, HeartbeatRequest request, CancellationToken ct) => Task.CompletedTask;

    public Task<int> IngestEventsAsync(string accessToken, IReadOnlyList<EventEnvelope> events, CancellationToken ct) =>
        Task.FromResult(events.Count);

    public Task<EffectivePolicy> GetPolicyAsync(string accessToken, CancellationToken ct) =>
        Task.FromResult(new EffectivePolicy());

    public Task<IReadOnlyList<PendingRemoteAction>> GetPendingActionsAsync(string accessToken, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<PendingRemoteAction>>([]);

    public Task CompleteActionAsync(string accessToken, string actionId, CompleteRemoteActionRequest request, CancellationToken ct) =>
        Task.CompletedTask;

    public Task<LatestReleaseInfo?> GetLatestReleaseAsync(string accessToken, string channel, CancellationToken ct) =>
        Task.FromResult<LatestReleaseInfo?>(null);

    public List<byte[]> UploadedScreenshots { get; } = [];
    public List<byte[]> UploadedFrames { get; } = [];
    public bool NextFrameShouldContinue { get; set; } = true;

    public Task UploadScreenshotAsync(string accessToken, byte[] jpegBytes, DateTimeOffset capturedAt, int? width, int? height, CancellationToken ct)
    {
        UploadedScreenshots.Add(jpegBytes);
        return Task.CompletedTask;
    }

    public Task<bool> UploadScreenFrameAsync(string accessToken, string sessionId, byte[] jpegBytes, CancellationToken ct)
    {
        UploadedFrames.Add(jpegBytes);
        return Task.FromResult(NextFrameShouldContinue);
    }
}

public sealed class AccessTokenProviderTests
{
    private static AccessTokenProvider MakeProvider(FakeVgonApiClient api, FakeCredentialStore store, string? provisioningToken = "some-provisioning-token")
    {
        var options = Options.Create(new AgentOptions { ProvisioningToken = provisioningToken });
        return new AccessTokenProvider(api, store, options, NullLogger<AccessTokenProvider>.Instance);
    }

    [Fact]
    public async Task Registers_on_first_use_when_no_credential_is_stored()
    {
        var api = new FakeVgonApiClient();
        var store = new FakeCredentialStore();
        var provider = MakeProvider(api, store);

        var (deviceId, accessToken) = await provider.GetAccessTokenAsync(CancellationToken.None);

        Assert.Equal(1, api.RegisterCalls);
        Assert.Equal(0, api.RefreshCalls);
        Assert.Equal("device-1", deviceId);
        Assert.Equal("access-token-from-register", accessToken);
        Assert.Equal("refresh-token-1", store.Stored?.RefreshToken);
    }

    [Fact]
    public async Task Refreshes_instead_of_registering_when_a_credential_already_exists()
    {
        var api = new FakeVgonApiClient();
        var store = new FakeCredentialStore();
        store.Save(new DeviceCredentials("device-1", "existing-refresh-token"));
        var provider = MakeProvider(api, store);

        await provider.GetAccessTokenAsync(CancellationToken.None);

        Assert.Equal(0, api.RegisterCalls);
        Assert.Equal(1, api.RefreshCalls);
    }

    [Fact]
    public async Task Caches_the_access_token_and_does_not_call_the_API_again_before_expiry()
    {
        var api = new FakeVgonApiClient();
        var store = new FakeCredentialStore();
        var provider = MakeProvider(api, store);

        await provider.GetAccessTokenAsync(CancellationToken.None);
        await provider.GetAccessTokenAsync(CancellationToken.None);
        await provider.GetAccessTokenAsync(CancellationToken.None);

        Assert.Equal(1, api.RegisterCalls);
    }

    [Fact]
    public async Task Invalidate_forces_a_fresh_token_on_the_next_call()
    {
        var api = new FakeVgonApiClient();
        var store = new FakeCredentialStore();
        var provider = MakeProvider(api, store);

        await provider.GetAccessTokenAsync(CancellationToken.None);
        provider.Invalidate();
        await provider.GetAccessTokenAsync(CancellationToken.None);

        // First call registers; the invalidated second call has a stored credential now, so it refreshes.
        Assert.Equal(1, api.RegisterCalls);
        Assert.Equal(1, api.RefreshCalls);
    }

    [Fact]
    public async Task Throws_a_clear_error_when_no_credential_and_no_provisioning_token_are_available()
    {
        var api = new FakeVgonApiClient();
        var store = new FakeCredentialStore();
        var provider = MakeProvider(api, store, provisioningToken: null);

        await Assert.ThrowsAsync<InvalidOperationException>(() => provider.GetAccessTokenAsync(CancellationToken.None));
    }
}
