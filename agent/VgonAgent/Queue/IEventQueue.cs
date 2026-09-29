using VgonAgent.Models;

namespace VgonAgent.Queue;

public interface IEventQueue
{
    Task EnqueueAsync(EventEnvelope envelope, CancellationToken ct);

    /// <summary>Highest-priority (by severity), oldest-first batch of events due for (re)delivery.</summary>
    Task<IReadOnlyList<QueuedEventRecord>> DequeueBatchAsync(int maxCount, CancellationToken ct);

    Task MarkSentAsync(IEnumerable<long> ids, CancellationToken ct);

    /// <summary>Schedules an exponential-backoff retry for a batch that failed to upload.</summary>
    Task MarkFailedAsync(IEnumerable<long> ids, CancellationToken ct);

    /// <summary>Drops events past their retention window or retry budget so the queue can't grow unbounded offline.</summary>
    Task<int> PurgeExpiredAsync(CancellationToken ct);
}
