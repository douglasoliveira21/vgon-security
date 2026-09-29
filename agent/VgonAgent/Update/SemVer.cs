using System.Text.RegularExpressions;

namespace VgonAgent.Update;

/// <summary>
/// Minimal semver (major.minor.patch[-prerelease]) parsing and comparison — just enough to
/// decide "is the published release newer than what's running". Pure/testable.
/// </summary>
public static partial class SemVer
{
    /// <summary>True if <paramref name="candidate"/> is strictly newer than <paramref name="current"/>.
    /// An unparseable version on either side is treated as "not newer" (fail safe: never update
    /// on ambiguous version data).</summary>
    public static bool IsNewer(string candidate, string current)
    {
        if (!TryParse(candidate, out var c) || !TryParse(current, out var b)) return false;

        if (c.Major != b.Major) return c.Major > b.Major;
        if (c.Minor != b.Minor) return c.Minor > b.Minor;
        if (c.Patch != b.Patch) return c.Patch > b.Patch;

        // Same major.minor.patch: a release WITHOUT a prerelease tag outranks one WITH one
        // (1.4.0 > 1.4.0-beta.1); between two prereleases, compare the tag text.
        if (c.Prerelease is null && b.Prerelease is null) return false;
        if (c.Prerelease is null) return true;
        if (b.Prerelease is null) return false;
        return string.CompareOrdinal(c.Prerelease, b.Prerelease) > 0;
    }

    public static bool TryParse(string version, out (int Major, int Minor, int Patch, string? Prerelease) parsed)
    {
        var match = VersionRegex().Match(version.Trim());
        if (!match.Success)
        {
            parsed = default;
            return false;
        }

        parsed = (
            int.Parse(match.Groups["major"].Value),
            int.Parse(match.Groups["minor"].Value),
            int.Parse(match.Groups["patch"].Value),
            match.Groups["prerelease"].Success ? match.Groups["prerelease"].Value : null);
        return true;
    }

    [GeneratedRegex(@"^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(-(?<prerelease>[\w.]+))?$")]
    private static partial Regex VersionRegex();
}
