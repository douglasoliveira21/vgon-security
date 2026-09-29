namespace VgonAgent.Screen;

/// <summary>
/// Owns the (at most one) active live screen-view session. Separate from
/// <see cref="VgonAgent.Rmm.RemoteActionExecutor"/> because a session runs for minutes, far
/// longer than the executor's normal "dispatch, get a result, move on" shape — see
/// <see cref="VgonAgent.Rmm.RemoteActionResult.Deferred"/>.
/// </summary>
public interface IScreenViewSessionRunner
{
    /// <summary>Starts the session in the background and returns immediately. False (session NOT
    /// started) only when another session is already running on this device.</summary>
    bool TryStart(string actionId);
}
