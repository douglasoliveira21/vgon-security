using System.Collections.Concurrent;

namespace VgonAgent.Rmm;

public sealed class CollectionTrigger : ICollectionTrigger
{
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _signals = new();

    public void TriggerNow(string collectorName)
    {
        var signal = _signals.GetOrAdd(collectorName, _ => new SemaphoreSlim(0, 1));
        // CurrentCount caps at 1 — multiple triggers before the collector wakes up still only
        // cause a single extra run, not a growing backlog of releases.
        if (signal.CurrentCount == 0)
        {
            signal.Release();
        }
    }

    public async Task WaitOrDelayAsync(string collectorName, TimeSpan delay, CancellationToken ct)
    {
        var signal = _signals.GetOrAdd(collectorName, _ => new SemaphoreSlim(0, 1));
        var delayTask = Task.Delay(delay, ct);
        var signalTask = signal.WaitAsync(ct);
        await Task.WhenAny(delayTask, signalTask);
    }
}
