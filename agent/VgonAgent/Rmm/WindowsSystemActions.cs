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

    public bool RestartDevice()
    {
        // shutdown.exe, not InitiateSystemShutdownEx: it already handles the "warn logged-on users
        // and give them a chance to save work" dialog on its own and needs no privilege enabling
        // (unlike WTSQueryUserToken elsewhere here) when run as LocalSystem.
        const int delaySeconds = 60;
        try
        {
            using var process = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "shutdown.exe",
                Arguments = $"/r /t {delaySeconds} /c \"VGON Security+: a restart was requested by an administrator.\"",
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            _logger.LogWarning("RESTART_DEVICE remote action received; machine will reboot in {Delay}s", delaySeconds);
            return process is not null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to launch shutdown.exe for RESTART_DEVICE");
            return false;
        }
    }

    /// <summary>
    /// Triggers Windows' own built-in factory-reset flow (systemreset.exe -factoryreset) — the
    /// same mechanism behind Settings &gt; Recovery &gt; Reset this PC &gt; Remove everything, and
    /// what OEM push-button-reset firmware calls under the hood. Not custom disk-wiping code: this
    /// hands off to Windows' own recovery environment (WinRE) after a reboot, which is what
    /// actually erases the drive and reinstalls Windows.
    ///
    /// NOT verified end-to-end against a real completed wipe during development — doing so would
    /// have destroyed the machine it ran on. This method's correctness rests on Microsoft's own
    /// documented behavior for systemreset.exe, not on an observed successful run. Validate this
    /// on a genuinely disposable VM or test machine — not anything with data you need — before
    /// relying on it against a real device.
    /// </summary>
    public bool WipeDevice()
    {
        try
        {
            using var process = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = Path.Combine(Environment.SystemDirectory, "systemreset.exe"),
                Arguments = "-factoryreset",
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            _logger.LogCritical("WIPE_DEVICE remote action received; factory reset launched, machine will reboot into WinRE");
            return process is not null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to launch systemreset.exe for WIPE_DEVICE");
            return false;
        }
    }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSDisconnectSession(IntPtr hServer, int sessionId, [MarshalAs(UnmanagedType.Bool)] bool bWait);
}
