namespace VgonAgent.Collectors;

/// <summary>
/// The Agent runs as LocalSystem, so there is no single "current user" — every profile-scoped
/// collector (Browser, File, ...) walks the real `C:\Users\*` directories instead of relying on
/// per-user environment variables/special folders, which would resolve for the service account.
/// </summary>
public static class UserProfiles
{
    private static readonly HashSet<string> ExcludedFolders = new(StringComparer.OrdinalIgnoreCase)
    {
        "Public", "Default", "Default User", "All Users", "defaultuser0",
    };

    public static IEnumerable<(string UserName, string ProfileDir)> Enumerate()
    {
        var usersRoot = Path.Combine(Environment.GetEnvironmentVariable("SystemDrive") ?? "C:", "Users");
        if (!Directory.Exists(usersRoot)) yield break;

        foreach (var dir in Directory.EnumerateDirectories(usersRoot))
        {
            var name = Path.GetFileName(dir);
            if (ExcludedFolders.Contains(name)) continue;
            yield return (name, dir);
        }
    }
}
