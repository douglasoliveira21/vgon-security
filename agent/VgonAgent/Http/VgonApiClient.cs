using System.Net.Http.Headers;
using System.Net.Http.Json;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Rmm;

namespace VgonAgent.Http;

public sealed class VgonApiClient : IVgonApiClient
{
    private readonly HttpClient _http;

    public VgonApiClient(HttpClient http)
    {
        _http = http;
    }

    public async Task<DeviceTokenResponse> RegisterAsync(RegisterDeviceRequest request, CancellationToken ct)
    {
        var response = await _http.PostAsJsonAsync("agents/register", request, ct);
        await EnsureSuccess(response, ct);
        return (await response.Content.ReadFromJsonAsync<DeviceTokenResponse>(cancellationToken: ct))!;
    }

    public async Task<DeviceTokenResponse> RefreshAsync(RefreshTokenRequest request, CancellationToken ct)
    {
        var response = await _http.PostAsJsonAsync("agents/token/refresh", request, ct);
        await EnsureSuccess(response, ct);
        return (await response.Content.ReadFromJsonAsync<DeviceTokenResponse>(cancellationToken: ct))!;
    }

    public async Task SendHeartbeatAsync(string accessToken, HeartbeatRequest request, CancellationToken ct)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "agents/heartbeat")
        {
            Content = JsonContent.Create(request),
        };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _http.SendAsync(message, ct);
        await EnsureSuccess(response, ct);
    }

    public async Task<int> IngestEventsAsync(string accessToken, IReadOnlyList<EventEnvelope> events, CancellationToken ct)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "events")
        {
            Content = JsonContent.Create(new IngestEventsRequest { Events = events.ToList() }),
        };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _http.SendAsync(message, ct);
        await EnsureSuccess(response, ct);
        return events.Count;
    }

    public async Task<EffectivePolicy> GetPolicyAsync(string accessToken, CancellationToken ct)
    {
        using var message = new HttpRequestMessage(HttpMethod.Get, "agents/policy");
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _http.SendAsync(message, ct);
        await EnsureSuccess(response, ct);
        return (await response.Content.ReadFromJsonAsync<EffectivePolicy>(cancellationToken: ct))!;
    }

    public async Task<IReadOnlyList<PendingRemoteAction>> GetPendingActionsAsync(string accessToken, CancellationToken ct)
    {
        using var message = new HttpRequestMessage(HttpMethod.Get, "agents/actions/pending");
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _http.SendAsync(message, ct);
        await EnsureSuccess(response, ct);
        return (await response.Content.ReadFromJsonAsync<List<PendingRemoteAction>>(cancellationToken: ct))!;
    }

    public async Task CompleteActionAsync(string accessToken, string actionId, CompleteRemoteActionRequest request, CancellationToken ct)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, $"agents/actions/{actionId}/complete")
        {
            Content = JsonContent.Create(request),
        };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _http.SendAsync(message, ct);
        await EnsureSuccess(response, ct);
    }

    public async Task<LatestReleaseInfo?> GetLatestReleaseAsync(string accessToken, string channel, CancellationToken ct)
    {
        using var message = new HttpRequestMessage(HttpMethod.Get, $"agents/updates/latest?channel={Uri.EscapeDataString(channel)}");
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _http.SendAsync(message, ct);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return null; // no release published yet
        await EnsureSuccess(response, ct);
        return await response.Content.ReadFromJsonAsync<LatestReleaseInfo>(cancellationToken: ct);
    }

    public async Task UploadScreenshotAsync(string accessToken, byte[] jpegBytes, DateTimeOffset capturedAt, int? width, int? height, CancellationToken ct)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "agents/screenshots")
        {
            Content = new ByteArrayContent(jpegBytes),
        };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        message.Content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        message.Headers.Add("X-Captured-At", capturedAt.ToString("O"));
        if (width is not null) message.Headers.Add("X-Image-Width", width.Value.ToString());
        if (height is not null) message.Headers.Add("X-Image-Height", height.Value.ToString());

        var response = await _http.SendAsync(message, ct);
        await EnsureSuccess(response, ct);
    }

    public async Task<bool> UploadScreenFrameAsync(string accessToken, string sessionId, byte[] jpegBytes, CancellationToken ct)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, $"agents/screen-sessions/{sessionId}/frame")
        {
            Content = new ByteArrayContent(jpegBytes),
        };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        message.Content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");

        var response = await _http.SendAsync(message, ct);
        await EnsureSuccess(response, ct);
        var ack = await response.Content.ReadFromJsonAsync<ScreenFrameAck>(cancellationToken: ct);
        return ack?.Continue ?? false;
    }

    private sealed class ScreenFrameAck
    {
        [System.Text.Json.Serialization.JsonPropertyName("continue")]
        public bool Continue { get; init; }
    }

    private static async Task EnsureSuccess(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        var body = await response.Content.ReadAsStringAsync(ct);
        throw new VgonApiException(response.StatusCode, body);
    }
}

public sealed class VgonApiException(System.Net.HttpStatusCode statusCode, string body)
    : Exception($"VGON API request failed with {(int)statusCode} {statusCode}: {body}")
{
    public System.Net.HttpStatusCode StatusCode { get; } = statusCode;
}
