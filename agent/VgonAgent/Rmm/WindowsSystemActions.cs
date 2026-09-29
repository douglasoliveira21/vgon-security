using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Microsoft.Extensions.Logging;

namespace VgonAgent.Rmm;

/// <summary>
/// The Agent runs as LocalSystem in Session 0 (session isolation since Vista/Win7), so plain
/// user32.dll LockWorkStation() would lock Session 0, not the interactive user's desktop.
/// WTSDisconnectSession on the active console session is the correct LocalSystem-service
/// equivalent — it forces re-authentication, the same security outcome as a lock screen.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsSystemActions : ISystemActions
{
    private const int WTS_CURRENT_SERVER_HANDLE = 0;
    private readonly ILogger<WindowsSystemActions> _logger;

    public WindowsSystemActions(ILogger<WindowsSystemActions> logger)
    {
        _logger = logger;
    }

    public bool LockActiveSession()
    {
        var activeSessionId = ActiveSessionLocator.FindActiveSessionId();
        if (activeSessionId is null)
        {
            _logger.LogInformation("No active interactive session found to lock");
            return false;
        }

        var ok = WTSDisconnectSession(IntPtr.Zero, activeSessionId.Value, false);
        if (!ok)
        {
            var error = Marshal.GetLastWin32Error();
            _logger.LogWarning("WTSDisconnectSession failed for session {SessionId}, Win32 error {Error}", activeSessionId, error);
        }
        return ok;
    }

    public void ExitForRestart()
    {
        _logger.LogWarning("RESTART_AGENT remote action received; exiting process now");
        Environment.Exit(0);
    }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSDisconnectSession(IntPtr hServer, int sessionId, [MarshalAs(UnmanagedType.Bool)] bool bWait);
}
