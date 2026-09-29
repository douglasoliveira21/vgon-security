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
}
