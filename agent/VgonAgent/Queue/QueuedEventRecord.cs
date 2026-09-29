namespace VgonAgent.Queue;

public sealed record QueuedEventRecord(long Id, string EventId, string Payload, int Attempts);
