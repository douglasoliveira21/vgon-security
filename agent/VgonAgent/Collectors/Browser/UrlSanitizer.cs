using VgonAgent.Models;

namespace VgonAgent.Collectors.Browser;

public sealed record SanitizedUrl(string Url, string Domain);

/// <summary>
/// Applies the configured browser URL policy (section 8) BEFORE an event ever reaches the
/// local queue — the Cloud only ever sees what this class decided to keep. Never captures
/// page content; only operates on the URL string itself.
/// </summary>
public static class UrlSanitizer
{
    public static SanitizedUrl Apply(string rawUrl, string policy, IReadOnlyCollection<string> sensitiveParams)
    {
        if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out var uri))
        {
            // Not a well-formed absolute URL (e.g. a browser internal page) — domain is unknown,
            // and there's nothing meaningful to redact structurally, so just pass the raw string
            // through under FULL_URL/SANITIZED_URL, or blank it under DOMAIN_ONLY.
            return policy == Models.BrowserUrlPolicy.DomainOnly
                ? new SanitizedUrl(string.Empty, string.Empty)
                : new SanitizedUrl(rawUrl, string.Empty);
        }

        var domain = uri.Host;

        return policy switch
        {
            Models.BrowserUrlPolicy.FullUrl => new SanitizedUrl(rawUrl, domain),
            Models.BrowserUrlPolicy.DomainOnly => new SanitizedUrl($"{uri.Scheme}://{domain}/", domain),
            _ => new SanitizedUrl(BuildSanitized(uri, sensitiveParams), domain),
        };
    }

    private static string BuildSanitized(Uri uri, IReadOnlyCollection<string> sensitiveParams)
    {
        var builder = new UriBuilder(uri)
        {
            // Fragments never reach the server and commonly carry OAuth implicit-flow tokens
            // or SPA router state — always dropped, regardless of the sensitive-params list.
            Fragment = string.Empty,
        };

        if (string.IsNullOrEmpty(uri.Query))
        {
            return builder.Uri.ToString();
        }

        // Manual key=value parsing (order-preserving) instead of System.Web.HttpUtility, which
        // isn't part of the plain Worker Service shared framework.
        var rawQuery = uri.Query.TrimStart('?');
        var pairs = rawQuery.Split('&', StringSplitOptions.RemoveEmptyEntries);
        var rebuilt = new List<string>(pairs.Length);

        foreach (var pair in pairs)
        {
            var separatorIndex = pair.IndexOf('=');
            var key = separatorIndex >= 0 ? pair[..separatorIndex] : pair;
            var decodedKey = Uri.UnescapeDataString(key);

            var isSensitive = sensitiveParams.Any(sensitive => decodedKey.Contains(sensitive, StringComparison.OrdinalIgnoreCase));
            rebuilt.Add(isSensitive ? $"{key}=REDACTED" : pair);
        }

        builder.Query = string.Join('&', rebuilt);
        return builder.Uri.ToString();
    }
}
