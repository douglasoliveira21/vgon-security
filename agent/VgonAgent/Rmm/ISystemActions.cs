namespace VgonAgent.Rmm;

/// <summary>OS-level effects a remote action can trigger, abstracted so RemoteActionExecutor's
/// dispatch logic is testable without actually locking a session or restarting the process.</summary>
public interface ISystemActions
{
    /// <summary>Secures the active interactive session. Returns whether a session was found to act on.</summary>
    bool LockActiveSession();

    /// <summary>Exits the Agent process. If installed as a Windows Service with recovery actions
    /// configured (see the Agent README), the Service Control Manager restarts it — this call
    /// itself does not restart anything, it only stops the current process.</summary>
    void ExitForRestart();

    /// <summary>Schedules a full OS reboot of the machine (not just the Agent process). Returns
    /// whether the reboot was successfully scheduled — the reboot itself happens after the delay,
    /// asynchronously, so a true result here does not guarantee the machine actually restarts
    /// (e.g. a pending shutdown block from another process).</summary>
    bool RestartDevice();

    /// <summary>Irreversibly erases the device via Windows' own full factory-reset flow. Returns
    /// whether the reset was successfully launched — the actual wipe happens after a reboot into
    /// WinRE, asynchronously, so a true result here is not a guarantee the wipe itself completes.</summary>
    bool WipeDevice();
}
