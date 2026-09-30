using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace VgonAgent.Rmm;

/// <summary>
/// Finds the Windows session id of the current active interactive console session. Shared by
/// <see cref="WindowsSystemActions"/> (LOCK_SESSION) and
/// <see cref="VgonAgent.Screen.WindowsInteractiveProcessLauncher"/> (screenshots / live screen
/// view) — both need this because the Agent itself runs as LocalSystem in Session 0, which has
/// no interactive desktop of its own (see the Agent README's "Install as a Windows Service").
/// </summary>
[SupportedOSPlatform("windows")]
internal static class ActiveSessionLocator
{
    /// <summary>The account name logged into the active console session right now, or null if
    /// nobody is (locked console with no session, RDP disconnected, kiosk boot screen, ...). Used
    /// for the "logged-in user" shown alongside the hostname in the Devices list — see
    /// HeartbeatService.</summary>
    public static string? GetActiveSessionUserName()
    {
        var sessionId = FindActiveSessionId();
        if (sessionId is null) return null;

        if (!WTSQuerySessionInformation(IntPtr.Zero, sessionId.Value, WTS_INFO_CLASS.WTSUserName, out var buffer, out _))
        {
            return null;
        }

        try
        {
            var userName = Marshal.PtrToStringUni(buffer);
            return string.IsNullOrEmpty(userName) ? null : userName;
        }
        finally
        {
            WTSFreeMemory(buffer);
        }
    }

    public static int? FindActiveSessionId()
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

    private enum WTS_INFO_CLASS
    {
        WTSUserName = 5,
    }

    [DllImport("wtsapi32.dll")]
    private static extern bool WTSEnumerateSessions(IntPtr hServer, int reserved, int version, out IntPtr sessionInfo, out int count);

    [DllImport("wtsapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool WTSQuerySessionInformation(
        IntPtr hServer, int sessionId, WTS_INFO_CLASS wtsInfoClass, out IntPtr ppBuffer, out int pBytesReturned);

    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr memory);
}
