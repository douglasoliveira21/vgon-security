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
        var activeSessionId = FindActiveSessionId();
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

    private int? FindActiveSessionId()
    {
        if (!WTSEnumerateSessions(IntPtr.Zero, 0, 1, out var sessionsPtr, out var count))
        {
            return null;
        }

        try
        {
            var size = Marshal.SizeOf<WTS_SESSION_INFO>();
            for (var i = 0; i < count; i++)
            {
                var info = Marshal.PtrToStructure<WTS_SESSION_INFO>(sessionsPtr + i * size);
                if (info.State == WTS_CONNECTSTATE_CLASS.WTSActive)
                {
                    return info.SessionId;
                }
            }
            return null;
        }
        finally
        {
            WTSFreeMemory(sessionsPtr);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WTS_SESSION_INFO
    {
        public int SessionId;
        [MarshalAs(UnmanagedType.LPStr)] public string WinStationName;
        public WTS_CONNECTSTATE_CLASS State;
    }

    private enum WTS_CONNECTSTATE_CLASS
    {
        WTSActive,
        WTSConnected,
        WTSConnectQuery,
        WTSShadow,
        WTSDisconnected,
        WTSIdle,
        WTSListen,
        WTSReset,
        WTSDown,
        WTSInit,
    }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSDisconnectSession(IntPtr hServer, int sessionId, [MarshalAs(UnmanagedType.Bool)] bool bWait);

    [DllImport("wtsapi32.dll")]
    private static extern bool WTSEnumerateSessions(IntPtr hServer, int reserved, int version, out IntPtr sessionInfo, out int count);

    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr memory);
}
