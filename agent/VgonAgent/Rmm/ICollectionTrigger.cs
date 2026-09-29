namespace VgonAgent.Rmm;

/// <summary>
/// Lets a long-interval collector (Hardware/Software/Security) be woken up immediately — used
/// by the COLLECT_INVENTORY remote action (section 26/Phase 7) — without tearing down its normal
/// Task.Delay-based loop. A collector calls <see cref="WaitOrDelayAsync"/> where it would
/// otherwise just Task.Delay; RemoteActionExecutor calls <see cref="TriggerNow"/>.
/// </summary>
public interface ICollectionTrigger
{
    void TriggerNow(string collectorName);

    Task WaitOrDelayAsync(string collectorName, TimeSpan delay, CancellationToken ct);
}
