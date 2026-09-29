using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Http;
using VgonAgent.Identity;
using VgonAgent.Models;
using VgonAgent.Queue;

namespace VgonAgent.Services;

/// <summary>
/// Drains the local SQLite queue in priority order and uploads batches to the Cloud
/// (section 14: SQLite Queue -> Batch -> HTTPS -> Cloud). Runs independently of the
/// collectors that fill the queue, so a slow/offline API never blocks event collection.
/// </summary>
public sealed class EventUploaderService : BackgroundService
{
    private readonly IEventQueue _queue;
    private readonly IAccessTokenProvider _tokenProvider;
    private readonly IVgonApiClient _api;
    private readonly AgentOptions _options;
    private readonly ILogger<EventUploaderService> _logger;

    public EventUploaderService(
        IEventQueue queue,
        IAccessTokenProvider tokenProvider,
        IVgonApiClient api,
        IOptions<AgentOptions> options,
        ILogger<EventUploaderService> logger)
    {
        _queue = queue;
        _tokenProvider = tokenProvider;
        _api = api;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _queue.PurgeExpiredAsync(stoppingToken);
                await UploadOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Event upload cycle failed; will retry next interval");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.EventUploadIntervalSeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task UploadOnceAsync(CancellationToken ct)
    {
        var batch = await _queue.DequeueBatchAsync(_options.EventUploadBatchSize, ct);
        if (batch.Count == 0) return;

        var envelopes = batch
            .Select(record => JsonSerializer.Deserialize<EventEnvelope>(record.Payload))
            .Where(e => e is not null)
            .Select(e => e!)
            .ToList();

        try
        {
            var (_, accessToken) = await _tokenProvider.GetAccessTokenAsync(ct);
            await _api.IngestEventsAsync(accessToken, envelopes, ct);
            await _queue.MarkSentAsync(batch.Select(r => r.Id), ct);
            _logger.LogDebug("Uploaded {Count} events", envelopes.Count);
        }
        catch (VgonApiException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Unauthorized)
        {
            _logger.LogWarning("Event upload rejected (401); invalidating cached access token, will retry next cycle");
            _tokenProvider.Invalidate();
            await _queue.MarkFailedAsync(batch.Select(r => r.Id), ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to upload {Count} events; scheduling retry with backoff", envelopes.Count);
            await _queue.MarkFailedAsync(batch.Select(r => r.Id), ct);
        }
    }
}
