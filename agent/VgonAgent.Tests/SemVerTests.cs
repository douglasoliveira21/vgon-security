using VgonAgent.Update;

namespace VgonAgent.Tests;

public sealed class SemVerTests
{
    [Theory]
    [InlineData("1.5.0", "1.4.0")]
    [InlineData("2.0.0", "1.9.9")] // major beats a higher patch/minor on the older side
    [InlineData("1.4.1", "1.4.0")]
    [InlineData("1.10.0", "1.9.0")] // numeric comparison, not string comparison ("1.10" < "1.9" as strings)
    public void Detects_a_newer_version(string candidate, string current)
    {
        Assert.True(SemVer.IsNewer(candidate, current));
    }

    [Theory]
    [InlineData("1.4.0", "1.4.0")] // identical
    [InlineData("1.4.0", "1.5.0")] // older
    [InlineData("1.4.0", "2.0.0")]
    public void Does_not_flag_an_equal_or_older_version_as_newer(string candidate, string current)
    {
        Assert.False(SemVer.IsNewer(candidate, current));
    }

    [Fact]
    public void A_stable_release_outranks_a_prerelease_of_the_same_version()
    {
        Assert.True(SemVer.IsNewer("1.4.0", "1.4.0-beta.1"));
        Assert.False(SemVer.IsNewer("1.4.0-beta.1", "1.4.0"));
    }

    [Theory]
    [InlineData("not-a-version", "1.4.0")]
    [InlineData("1.4.0", "not-a-version")]
    [InlineData("garbage", "also-garbage")]
    public void An_unparseable_version_on_either_side_is_never_treated_as_newer(string candidate, string current)
    {
        // Fail-safe: ambiguous version data must never trigger an update.
        Assert.False(SemVer.IsNewer(candidate, current));
    }
}
