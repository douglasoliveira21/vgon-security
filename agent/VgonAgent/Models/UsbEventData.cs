using System.Text.Json.Serialization;

namespace VgonAgent.Models;

public sealed class UsbEventData
{
    [JsonPropertyName("vendorId")]
    public string? VendorId { get; init; }

    [JsonPropertyName("productId")]
    public string? ProductId { get; init; }

    [JsonPropertyName("serial")]
    public string? Serial { get; init; }

    [JsonPropertyName("manufacturer")]
    public string? Manufacturer { get; init; }

    [JsonPropertyName("model")]
    public required string Model { get; init; }

    [JsonPropertyName("capacityBytes")]
    public long? CapacityBytes { get; init; }

    [JsonPropertyName("user")]
    public string? User { get; init; }

    [JsonPropertyName("policyDecision")]
    public required string PolicyDecision { get; init; }

    [JsonPropertyName("blocked")]
    public bool Blocked { get; init; }
}
