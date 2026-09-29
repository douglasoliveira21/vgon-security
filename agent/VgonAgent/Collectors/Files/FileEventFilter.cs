namespace VgonAgent.Collectors.Files;

/// <summary>
/// Decides whether a filesystem change is worth reporting at all (section 9: "evitar
/// monitoramento indiscriminado ... para reduzir custo e ruído"). Pure and side-effect free
/// so it can be unit tested without touching the filesystem.
/// </summary>
public static class FileEventFilter
{
    private static readonly HashSet<string> AlwaysIgnoredSegments = new(StringComparer.OrdinalIgnoreCase)
    {
        "node_modules", ".git", "$RECYCLE.BIN", "System Volume Information",
    };

    public static bool ShouldIgnore(string path, IReadOnlyCollection<string> excludedExtensions)
    {
        var extension = Path.GetExtension(path);
        if (!string.IsNullOrEmpty(extension) &&
            excludedExtensions.Any(excluded => string.Equals(excluded, extension, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        var segments = path.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return segments.Any(AlwaysIgnoredSegments.Contains);
    }
}
