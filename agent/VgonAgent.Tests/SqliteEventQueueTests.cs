using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Models;
using VgonAgent.Queue;

namespace VgonAgent.Tests;

public sealed class SqliteEventQueueTests : IDisposable
{
    private readonly string _tempDir;
    private readonly SqliteEventQueue _queue;

    public SqliteEventQueueTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "vgon-agent-tests-" + Guid.NewGuid());
        var options = Options.Create(new AgentOptions { DataDirectory = _tempDir });
        _queue = new SqliteEventQueue(options, NullLogger<SqliteEventQueue>.Instance);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { /* best-effort cleanup */ }
    }

    private static EventEnvelope MakeEvent(string severity = EventSeverity.Info, string? eventId = null) => new()
    {
        EventId = eventId ?? Guid.NewGuid().ToString(),
        AgentVersion = "0.1.0",
        Timestamp = DateTimeOffset.UtcNow.ToString("O"),
        EventType = EventType.ProcessStarted,
        Severity = severity,
        Data = new ProcessEventData { Pid = 1, ProcessName = "notepad.exe" },
    };

    [Fact]
    public async Task Enqueue_then_dequeue_returns_the_same_event()
    {
        var envelope = MakeEvent();
        await _queue.EnqueueAsync(envelope, CancellationToken.None);

        var batch = await _queue.DequeueBatchAsync(10, CancellationToken.None);

        Assert.Single(batch);
        Assert.Equal(envelope.EventId, batch[0].EventId);
    }

    [Fact]
    public async Task Enqueueing_the_same_eventId_twice_is_idempotent()
    {
        var envelope = MakeEvent(eventId: "11111111-1111-1111-1111-111111111111");
        await _queue.EnqueueAsync(envelope, CancellationToken.None);
        await _queue.EnqueueAsync(envelope, CancellationToken.None); // duplicate, e.g. a collector re-detecting the same process

        var batch = await _queue.DequeueBatchAsync(10, CancellationToken.None);

        Assert.Single(batch);
    }

    [Fact]
    public async Task Critical_events_are_dequeued_before_older_low_severity_events()
    {
        await _queue.EnqueueAsync(MakeEvent(EventSeverity.Info), CancellationToken.None);
        await _queue.EnqueueAsync(MakeEvent(EventSeverity.Low), CancellationToken.None);
        var criticalEvent = MakeEvent(EventSeverity.Critical);
        await _queue.EnqueueAsync(criticalEvent, CancellationToken.None);

        var batch = await _queue.DequeueBatchAsync(10, CancellationToken.None);

        Assert.Equal(criticalEvent.EventId, batch[0].EventId);
    }

    [Fact]
    public async Task MarkSent_removes_the_event_so_it_is_not_redelivered()
    {
        var envelope = MakeEvent();
        await _queue.EnqueueAsync(envelope, CancellationToken.None);
        var batch = await _queue.DequeueBatchAsync(10, CancellationToken.None);

        await _queue.MarkSentAsync(batch.Select(b => b.Id), CancellationToken.None);

        var afterAck = await _queue.DequeueBatchAsync(10, CancellationToken.None);
        Assert.Empty(afterAck);
    }

    [Fact]
    public async Task MarkFailed_schedules_a_future_retry_instead_of_immediate_redelivery()
    {
        var envelope = MakeEvent();
        await _queue.EnqueueAsync(envelope, CancellationToken.None);
        var batch = await _queue.DequeueBatchAsync(10, CancellationToken.None);

        await _queue.MarkFailedAsync(batch.Select(b => b.Id), CancellationToken.None);

        // Backoff pushes next_attempt_at into the future, so it shouldn't show up immediately.
        var immediateRetry = await _queue.DequeueBatchAsync(10, CancellationToken.None);
        Assert.Empty(immediateRetry);
    }
}
