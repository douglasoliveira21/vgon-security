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

    [DllImport("wtsapi32.dll")]
    private static extern bool WTSEnumerateSessions(IntPtr hServer, int reserved, int version, out IntPtr sessionInfo, out int count);

    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr memory);
}
