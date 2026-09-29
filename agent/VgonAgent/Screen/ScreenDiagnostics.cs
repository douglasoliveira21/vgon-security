namespace VgonAgent.Screen;

/// <summary>
/// A plain, unfiltered text log dedicated to the screen-capture/live-view feature, written by
/// both the main service process and the interactive-session helper process. Exists because the
/// Windows EventLog provider these processes otherwise log through has, in practice, not been
/// showing this feature's Information-level entries (only Warning/Error ever appeared during
/// development) — rather than chase that further, this sidesteps it entirely with a file anyone
/// can read directly (<c>Get-Content</c>), independent of EventLog level filtering.
/// </summary>
public static class ScreenDiagnostics
{
    private static readonly string[] CandidatePaths =
    [
        @"C:\ProgramData\VgonSecurityPlus\screen-diagnostics.log",
        System.IO.Path.Combine(System.IO.Path.GetTempPath(), "vgon-screen-diagnostics.log"),
    ];

    public static void Log(string message)
    {
        var line = $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}";
        foreach (var path in CandidatePaths)
        {
            try
            {
                System.IO.File.AppendAllText(path, line);
                return; // first writable location wins
            }
            catch
            {
                // Try the next candidate — e.g. the service process can always write to
                // ProgramData, while the interactive helper process might not be able to.
            }
        }
    }

    public static void Log(string message, Exception ex) => Log($"{message}: {ex}");
}
