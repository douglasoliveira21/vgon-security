using VgonAgent.Rmm;

namespace VgonAgent.Tests;

public sealed class CollectionTriggerTests
{
    [Fact]
    public async Task WaitOrDelayAsync_returns_promptly_when_triggered_instead_of_waiting_the_full_delay()
    {
        var trigger = new CollectionTrigger();
        trigger.TriggerNow("hardware");

        var start = DateTimeOffset.UtcNow;
        await trigger.WaitOrDelayAsync("hardware", TimeSpan.FromSeconds(30), CancellationToken.None);
        var elapsed = DateTimeOffset.UtcNow - start;

        Assert.True(elapsed < TimeSpan.FromSeconds(5), $"Expected an early return, took {elapsed}");
    }

    [Fact]
    public async Task WaitOrDelayAsync_falls_through_to_the_delay_when_never_triggered()
    {
        var trigger = new CollectionTrigger();

        var start = DateTimeOffset.UtcNow;
        await trigger.WaitOrDelayAsync("software", TimeSpan.FromMilliseconds(200), CancellationToken.None);
        var elapsed = DateTimeOffset.UtcNow - start;

        Assert.True(elapsed >= TimeSpan.FromMilliseconds(150), $"Expected to wait out the delay, only took {elapsed}");
    }

    [Fact]
    public async Task A_trigger_for_one_collector_does_not_wake_a_different_collector()
    {
        var trigger = new CollectionTrigger();
        trigger.TriggerNow("hardware");

        var start = DateTimeOffset.UtcNow;
        await trigger.WaitOrDelayAsync("software", TimeSpan.FromMilliseconds(200), CancellationToken.None);
        var elapsed = DateTimeOffset.UtcNow - start;

        Assert.True(elapsed >= TimeSpan.FromMilliseconds(150));
    }

    [Fact]
    public void Multiple_triggers_before_a_wait_do_not_accumulate_beyond_one_pending_wakeup()
    {
        var trigger = new CollectionTrigger();

        // Should not throw (SemaphoreSlim(0,1) would throw on Release() past its max count if
        // this weren't guarded).
        trigger.TriggerNow("hardware");
        trigger.TriggerNow("hardware");
        trigger.TriggerNow("hardware");
    }
}
