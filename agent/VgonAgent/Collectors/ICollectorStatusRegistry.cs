using System.Collections.Concurrent;

namespace VgonAgent.Collectors;

public enum CollectorState
{
    RUNNING,
    STOPPED,
    ERROR,
}

/// <summary>Shared status board so HeartbeatService can report per-collector health (section 15/16)
/// without collectors and the heartbeat loop knowing about each other directly.</summary>
public interface ICollectorStatusRegistry
{
    void Report(string collectorName, CollectorState state);
    IReadOnlyDictionary<string, string> Snapshot();
}

public sealed class CollectorStatusRegistry : ICollectorStatusRegistry
{
    private readonly ConcurrentDictionary<string, CollectorState> _status = new();

    public void Report(string collectorName, CollectorState state) => _status[collectorName] = state;

    public IReadOnlyDictionary<string, string> Snapshot() =>
        _status.ToDictionary(kv => kv.Key, kv => kv.Value.ToString());
}
