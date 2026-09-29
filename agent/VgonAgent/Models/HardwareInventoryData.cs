using System.Text.Json.Serialization;

namespace VgonAgent.Models;

public sealed class DiskInfo
{
    [JsonPropertyName("model")]
    public required string Model { get; init; }

    [JsonPropertyName("sizeBytes")]
    public long? SizeBytes { get; init; }

    [JsonPropertyName("serial")]
    public string? Serial { get; init; }
}

public sealed class HardwareInventoryData
{
    [JsonPropertyName("cpu")]
    public string? Cpu { get; init; }

    [JsonPropertyName("cpuCores")]
    public int? CpuCores { get; init; }

    [JsonPropertyName("ramTotalBytes")]
    public long? RamTotalBytes { get; init; }

    [JsonPropertyName("disks")]
    public List<DiskInfo>? Disks { get; init; }

    [JsonPropertyName("gpu")]
    public string? Gpu { get; init; }

    [JsonPropertyName("motherboard")]
    public string? Motherboard { get; init; }

    [JsonPropertyName("biosVersion")]
    public string? BiosVersion { get; init; }

    [JsonPropertyName("serialNumber")]
    public string? SerialNumber { get; init; }
}
