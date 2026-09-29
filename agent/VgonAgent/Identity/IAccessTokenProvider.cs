namespace VgonAgent.Identity;

public interface IAccessTokenProvider
{
    /// <summary>Returns a valid access token, registering the device (first run) or
    /// rotating the refresh token as needed. Also exposes the resolved deviceId.</summary>
    Task<(string DeviceId, string AccessToken)> GetAccessTokenAsync(CancellationToken ct);

    /// <summary>Forces a refresh on the next call — used after a 401 from a protected endpoint,
    /// in case the cached token was revoked server-side before its natural expiry.</summary>
    void Invalidate();
}
