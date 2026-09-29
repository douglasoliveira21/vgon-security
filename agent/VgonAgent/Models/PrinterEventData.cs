using System.Text.Json.Serialization;

namespace VgonAgent.Models;

// Document metadata only (section 11) — the printed document's content is never captured.
public sealed class PrinterEventData
{
    [JsonPropertyName("printerName")]
    public required string PrinterName { get; init; }

    [JsonPropertyName("documentName")]
    public string? DocumentName { get; init; }

    [JsonPropertyName("user")]
    public string? User { get; init; }

    [JsonPropertyName("pages")]
    public int? Pages { get; init; }

    [JsonPropertyName("sizeBytes")]
    public long? SizeBytes { get; init; }
}
