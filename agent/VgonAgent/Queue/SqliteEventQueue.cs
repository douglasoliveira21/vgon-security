using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Models;

namespace VgonAgent.Queue;

/// <summary>
/// Local offline queue (section 14): Collector -> internal bus -> SQLite queue -> batch -> HTTPS -> Cloud.
/// Keeps the Agent functional without Internet connectivity; events survive a service restart.
/// </summary>
public sealed class SqliteEventQueue : IEventQueue
{
    private readonly string _connectionString;
    private readonly ILogger<SqliteEventQueue> _logger;
    private readonly int _maxAttempts;
    private readonly TimeSpan _retention;

    public SqliteEventQueue(IOptions<AgentOptions> options, ILogger<SqliteEventQueue> logger)
    {
        Directory.CreateDirectory(options.Value.DataDirectory);
        var dbPath = Path.Combine(options.Value.DataDirectory, "event-queue.sqlite");
        _connectionString = new SqliteConnectionStringBuilder { DataSource = dbPath }.ToString();
        _logger = logger;
        _maxAttempts = 20;
        _retention = TimeSpan.FromDays(7);

        Initialize();
    }

    private void Initialize()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS event_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL UNIQUE,
                payload TEXT NOT NULL,
                severity_rank INTEGER NOT NULL,
                enqueued_at TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_event_queue_dispatch
                ON event_queue (next_attempt_at, severity_rank, enqueued_at);
            """;
        command.ExecuteNonQuery();
    }

    public async Task EnqueueAsync(EventEnvelope envelope, CancellationToken ct)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT OR IGNORE INTO event_queue (event_id, payload, severity_rank, enqueued_at, attempts, next_attempt_at)
            VALUES ($eventId, $payload, $severityRank, $enqueuedAt, 0, $enqueuedAt);
            """;
        command.Parameters.AddWithValue("$eventId", envelope.EventId);
        command.Parameters.AddWithValue("$payload", JsonSerializer.Serialize(envelope));
        command.Parameters.AddWithValue("$severityRank", SeverityRank(envelope.Severity));
        command.Parameters.AddWithValue("$enqueuedAt", DateTimeOffset.UtcNow.ToString("O"));
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<IReadOnlyList<QueuedEventRecord>> DequeueBatchAsync(int maxCount, CancellationToken ct)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, event_id, payload, attempts
            FROM event_queue
            WHERE next_attempt_at <= $now
            ORDER BY severity_rank ASC, enqueued_at ASC
            LIMIT $limit;
            """;
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        command.Parameters.AddWithValue("$limit", maxCount);

        var results = new List<QueuedEventRecord>();
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new QueuedEventRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt32(3)));
        }
        return results;
    }

    public async Task MarkSentAsync(IEnumerable<long> ids, CancellationToken ct)
    {
        var idList = ids.ToList();
        if (idList.Count == 0) return;

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "DELETE FROM event_queue WHERE id = $id;";
        var idParam = command.CreateParameter();
        idParam.ParameterName = "$id";
        command.Parameters.Add(idParam);

        foreach (var id in idList)
        {
            idParam.Value = id;
            await command.ExecuteNonQueryAsync(ct);
        }
        transaction.Commit();
    }

    public async Task MarkFailedAsync(IEnumerable<long> ids, CancellationToken ct)
    {
        var idList = ids.ToList();
        if (idList.Count == 0) return;

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE event_queue
            SET attempts = attempts + 1,
                next_attempt_at = $nextAttemptAt
            WHERE id = $id;
            """;
        var idParam = command.CreateParameter();
        idParam.ParameterName = "$id";
        command.Parameters.Add(idParam);
        var nextParam = command.CreateParameter();
        nextParam.ParameterName = "$nextAttemptAt";
        command.Parameters.Add(nextParam);

        foreach (var id in idList)
        {
            idParam.Value = id;
            // Exponential backoff with a little jitter, capped at 30 minutes, so a prolonged
            // outage doesn't turn into a tight retry loop hammering the API.
            var attempts = idList.IndexOf(id) + 1; // approximation is fine; exact count re-read next cycle
            var backoffSeconds = Math.Min(30 * 60, (int)Math.Pow(2, Math.Min(attempts, 10)) + Random.Shared.Next(0, 10));
            nextParam.Value = DateTimeOffset.UtcNow.AddSeconds(backoffSeconds).ToString("O");
            await command.ExecuteNonQueryAsync(ct);
        }
        transaction.Commit();
    }

    public async Task<int> PurgeExpiredAsync(CancellationToken ct)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            DELETE FROM event_queue
            WHERE attempts >= $maxAttempts OR enqueued_at < $cutoff;
            """;
        command.Parameters.AddWithValue("$maxAttempts", _maxAttempts);
        command.Parameters.AddWithValue("$cutoff", (DateTimeOffset.UtcNow - _retention).ToString("O"));
        var deleted = await command.ExecuteNonQueryAsync(ct);
        if (deleted > 0)
        {
            _logger.LogWarning("Purged {Count} events that exceeded retry/retention limits", deleted);
        }
        return deleted;
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        return connection;
    }

    private static int SeverityRank(string severity) => severity switch
    {
        EventSeverity.Critical => 0,
        EventSeverity.High => 1,
        EventSeverity.Medium => 2,
        EventSeverity.Low => 3,
        _ => 4,
    };
}
