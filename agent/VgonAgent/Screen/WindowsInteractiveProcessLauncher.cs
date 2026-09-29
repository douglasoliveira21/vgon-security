using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using Microsoft.Extensions.Logging;
using VgonAgent.Rmm;

namespace VgonAgent.Screen;

/// <summary>
/// LocalSystem-service-to-user-session interop: WTSQueryUserToken + DuplicateTokenEx +
/// CreateProcessAsUser, the standard Win32 pattern for a Windows Service to run a process with UI
/// in the logged-on user's own session (the service's own Session 0 has no interactive desktop —
/// see <see cref="ActiveSessionLocator"/> and the Agent README). Not covered by the automated
/// test suite (nothing here runs meaningfully outside a real installed service + a real logged-on
/// user — see the Agent README's "Not verified for real" section for the project's precedent on
/// this kind of gap); <see cref="ScreenCaptureHelper"/>'s own capture/encode logic is what's unit
/// tested instead, via <see cref="Screen.PipeFraming"/>.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsInteractiveProcessLauncher : IInteractiveProcessLauncher
{
    private readonly ILogger<WindowsInteractiveProcessLauncher> _logger;

    public WindowsInteractiveProcessLauncher(ILogger<WindowsInteractiveProcessLauncher> logger)
    {
        _logger = logger;
    }

    public Process? LaunchInActiveSession(string exePath, string arguments)
    {
        var sessionId = ActiveSessionLocator.FindActiveSessionId();
        if (sessionId is null)
        {
            _logger.LogInformation("No active interactive session found; cannot launch {ExePath}", exePath);
            return null;
        }

        // LocalSystem's token carries SeTcbPrivilege but — like every Windows privilege — it sits
        // disabled until a process explicitly turns it on; WTSQueryUserToken fails with
        // ERROR_PRIVILEGE_NOT_HELD (1314) without this, even running as LocalSystem.
        if (!TryEnableTcbPrivilege(out var privilegeError))
        {
            _logger.LogWarning("Could not enable SeTcbPrivilege (needed for WTSQueryUserToken), Win32 error {Error}", privilegeError);
            // Attempt anyway — on some configurations the privilege is already enabled and this
            // adjustment is a no-op that still reports success; only bail out here if it hard-failed.
        }

        if (!WTSQueryUserToken(sessionId.Value, out var userToken))
        {
            _logger.LogWarning("WTSQueryUserToken failed for session {SessionId}, Win32 error {Error}", sessionId, Marshal.GetLastWin32Error());
            return null;
        }

        var primaryToken = IntPtr.Zero;
        var envBlock = IntPtr.Zero;
        try
        {
            if (!DuplicateTokenEx(userToken, GENERIC_ALL_ACCESS, IntPtr.Zero, SECURITY_IMPERSONATION_LEVEL.SecurityIdentification, TOKEN_TYPE.TokenPrimary, out primaryToken))
            {
                _logger.LogWarning("DuplicateTokenEx failed, Win32 error {Error}", Marshal.GetLastWin32Error());
                return null;
            }

            // Best-effort: a missing environment block just means the child inherits ambient
            // defaults rather than the target user's own PATH/TEMP/profile variables.
            if (!CreateEnvironmentBlock(out envBlock, primaryToken, false))
            {
                envBlock = IntPtr.Zero;
            }

            var startupInfo = new STARTUPINFO
            {
                cb = Marshal.SizeOf<STARTUPINFO>(),
                lpDesktop = "winsta0\\default", // the interactive window station/desktop — required for GDI capture and any UI
            };
            var processAttributes = new SECURITY_ATTRIBUTES { nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>() };
            var threadAttributes = new SECURITY_ATTRIBUTES { nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>() };

            var commandLine = new StringBuilder($"\"{exePath}\" {arguments}");
            const uint creationFlags = CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW;

            var created = CreateProcessAsUser(
                primaryToken,
                exePath,
                commandLine,
                ref processAttributes,
                ref threadAttributes,
                false,
                creationFlags,
                envBlock,
                null,
                ref startupInfo,
                out var processInfo);

            if (!created)
            {
                _logger.LogWarning("CreateProcessAsUser failed for {ExePath}, Win32 error {Error}", exePath, Marshal.GetLastWin32Error());
                return null;
            }

            CloseHandle(processInfo.hThread);
            CloseHandle(processInfo.hProcess); // Process.GetProcessById opens its own handle; this one is no longer needed

            try
            {
                return Process.GetProcessById(processInfo.dwProcessId);
            }
            catch (ArgumentException)
            {
                // Exited before we could look it up again — treat as a launch failure.
                return null;
            }
        }
        finally
        {
            if (envBlock != IntPtr.Zero) DestroyEnvironmentBlock(envBlock);
            if (primaryToken != IntPtr.Zero) CloseHandle(primaryToken);
            CloseHandle(userToken);
        }
    }

    private static bool TryEnableTcbPrivilege(out int win32Error)
    {
        win32Error = 0;
        if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, out var processToken))
        {
            win32Error = Marshal.GetLastWin32Error();
            return false;
        }

        try
        {
            if (!LookupPrivilegeValue(null, "SeTcbPrivilege", out var luid))
            {
                win32Error = Marshal.GetLastWin32Error();
                return false;
            }

            var privileges = new TOKEN_PRIVILEGES
            {
                PrivilegeCount = 1,
                Luid = luid,
                Attributes = SE_PRIVILEGE_ENABLED,
            };

            if (!AdjustTokenPrivileges(processToken, false, ref privileges, 0, IntPtr.Zero, IntPtr.Zero))
            {
                win32Error = Marshal.GetLastWin32Error();
                return false;
            }

            // AdjustTokenPrivileges can return true while still not granting the privilege
            // (e.g. it isn't present in the token at all) — GetLastError distinguishes the two.
            var lastError = Marshal.GetLastWin32Error();
            if (lastError == ERROR_NOT_ALL_ASSIGNED)
            {
                win32Error = lastError;
                return false;
            }

            return true;
        }
        finally
        {
            CloseHandle(processToken);
        }
    }

    private const int TOKEN_ADJUST_PRIVILEGES = 0x0020;
    private const int TOKEN_QUERY = 0x0008;
    private const uint SE_PRIVILEGE_ENABLED = 0x00000002;
    private const int ERROR_NOT_ALL_ASSIGNED = 1300;

    [StructLayout(LayoutKind.Sequential)]
    private struct LUID
    {
        public uint LowPart;
        public int HighPart;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TOKEN_PRIVILEGES
    {
        public uint PrivilegeCount;
        public LUID Luid;
        public uint Attributes;
    }

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(IntPtr processHandle, int desiredAccess, out IntPtr tokenHandle);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool LookupPrivilegeValue(string? lpSystemName, string lpName, out LUID luid);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool AdjustTokenPrivileges(
        IntPtr tokenHandle, bool disableAllPrivileges, ref TOKEN_PRIVILEGES newState,
        uint bufferLengthInBytes, IntPtr previousState, IntPtr returnLengthInBytes);

    private const uint GENERIC_ALL_ACCESS = 0x10000000;
    private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    private const uint CREATE_NO_WINDOW = 0x08000000;

    private enum SECURITY_IMPERSONATION_LEVEL
    {
        SecurityAnonymous,
        SecurityIdentification,
        SecurityImpersonation,
        SecurityDelegation,
    }

    private enum TOKEN_TYPE
    {
        TokenPrimary = 1,
        TokenImpersonation = 2,
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES
    {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        public bool bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public int cb;
        public string? lpReserved;
        public string? lpDesktop;
        public string? lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSQueryUserToken(int sessionId, out IntPtr phToken);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool DuplicateTokenEx(
        IntPtr hExistingToken, uint dwDesiredAccess, IntPtr lpTokenAttributes,
        SECURITY_IMPERSONATION_LEVEL impersonationLevel, TOKEN_TYPE tokenType, out IntPtr phNewToken);

    [DllImport("userenv.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

    [DllImport("userenv.dll", SetLastError = true)]
    private static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcessAsUser(
        IntPtr hToken, string? lpApplicationName, StringBuilder lpCommandLine,
        ref SECURITY_ATTRIBUTES lpProcessAttributes, ref SECURITY_ATTRIBUTES lpThreadAttributes,
        bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string? lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr hObject);
}
