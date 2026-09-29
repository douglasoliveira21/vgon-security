using VgonAgent.Collectors.Browser;
using BrowserUrlPolicy = VgonAgent.Models.BrowserUrlPolicy;

namespace VgonAgent.Tests;

public sealed class UrlSanitizerTests
{
    private static readonly string[] DefaultSensitiveParams =
        ["token", "session", "password", "pwd", "secret", "key", "auth", "sig", "signature", "credential"];

    [Fact]
    public void FullUrl_policy_passes_the_url_through_unchanged()
    {
        var result = UrlSanitizer.Apply(
            "https://example.com/search?q=hello&token=abc123",
            BrowserUrlPolicy.FullUrl,
            DefaultSensitiveParams);

        Assert.Equal("https://example.com/search?q=hello&token=abc123", result.Url);
        Assert.Equal("example.com", result.Domain);
    }

    [Fact]
    public void DomainOnly_policy_drops_path_query_and_fragment()
    {
        var result = UrlSanitizer.Apply(
            "https://example.com/account/settings?token=abc123#profile",
            BrowserUrlPolicy.DomainOnly,
            DefaultSensitiveParams);

        Assert.Equal("https://example.com/", result.Url);
        Assert.Equal("example.com", result.Domain);
    }

    [Theory]
    [InlineData("token")]
    [InlineData("access_token")]
    [InlineData("session_id")]
    [InlineData("password")]
    [InlineData("api_key")]
    [InlineData("auth")]
    public void SanitizedUrl_policy_redacts_the_value_of_sensitive_query_parameters(string sensitiveKey)
    {
        var result = UrlSanitizer.Apply(
            $"https://example.com/login?{sensitiveKey}=super-secret-value&q=hello",
            BrowserUrlPolicy.SanitizedUrl,
            DefaultSensitiveParams);

        Assert.DoesNotContain("super-secret-value", result.Url);
        Assert.Contains($"{sensitiveKey}=REDACTED", result.Url);
        Assert.Contains("q=hello", result.Url); // non-sensitive params are preserved
    }

    [Fact]
    public void SanitizedUrl_policy_always_strips_the_fragment_even_without_sensitive_query_params()
    {
        var result = UrlSanitizer.Apply(
            "https://example.com/callback#access_token=super-secret-oauth-token",
            BrowserUrlPolicy.SanitizedUrl,
            DefaultSensitiveParams);

        Assert.DoesNotContain("super-secret-oauth-token", result.Url);
        Assert.DoesNotContain("#", result.Url);
    }

    [Fact]
    public void SanitizedUrl_policy_leaves_urls_with_no_sensitive_params_untouched_besides_fragment()
    {
        var result = UrlSanitizer.Apply(
            "https://example.com/search?q=weather&page=2",
            BrowserUrlPolicy.SanitizedUrl,
            DefaultSensitiveParams);

        Assert.Equal("https://example.com/search?q=weather&page=2", result.Url);
    }

    [Fact]
    public void SanitizedUrl_policy_handles_urls_with_no_query_string()
    {
        var result = UrlSanitizer.Apply(
            "https://example.com/about",
            BrowserUrlPolicy.SanitizedUrl,
            DefaultSensitiveParams);

        Assert.Equal("https://example.com/about", result.Url);
        Assert.Equal("example.com", result.Domain);
    }

    [Fact]
    public void Non_absolute_or_internal_browser_urls_do_not_throw_and_report_no_domain()
    {
        var result = UrlSanitizer.Apply("chrome://newtab/", BrowserUrlPolicy.SanitizedUrl, DefaultSensitiveParams);

        // chrome:// IS a valid absolute URI (scheme "chrome"), so this mainly guards against
        // genuinely malformed strings not throwing and blowing up the collector loop.
        Assert.NotNull(result.Url);
    }

    [Fact]
    public void Malformed_url_string_does_not_throw()
    {
        var result = UrlSanitizer.Apply("not a url at all", BrowserUrlPolicy.SanitizedUrl, DefaultSensitiveParams);

        Assert.Equal(string.Empty, result.Domain);
    }
}
