namespace VgonAgent.Screen;

/// <summary>
/// Launches a process inside the currently active interactive user's session. The Agent's main
/// process runs as LocalSystem in Session 0, which has no desktop of its own (see the Agent
/// README), so screen capture (both the periodic ScreenshotCollector and the live view session)
/// has to happen in a small helper process running as the logged-on user instead — this is the
/// same "service launches a process in the user's session" pattern used by remote-support and
/// RMM tooling generally, via WTSQueryUserToken + CreateProcessAsUser.
/// </summary>
public interface IInteractiveProcessLauncher
{
    /// <summary>
    /// Starts <paramref name="exePath"/> with <paramref name="arguments"/> in the active
    /// interactive session's user context. Returns null if there is currently no active
    /// interactive session (locked-out console, nobody logged on, RDP disconnected, ...) or the
    /// launch itself failed — both are routine, expected conditions, not exceptions.
    /// </summary>
    System.Diagnostics.Process? LaunchInActiveSession(string exePath, string arguments);
}
