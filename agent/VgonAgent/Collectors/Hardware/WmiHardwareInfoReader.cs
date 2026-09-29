using System.Management;
using System.Runtime.Versioning;
using Microsoft.Extensions.Logging;
using VgonAgent.Models;

namespace VgonAgent.Collectors.Hardware;

/// <summary>IHardwareCollector's data source (section 12). Each WMI class is queried
/// independently and wrapped in its own try/catch so one missing/restricted class (e.g. no GPU,
/// or a locked-down WMI namespace) doesn't blank out the rest of the inventory.</summary>
[SupportedOSPlatform("windows")]
public sealed class WmiHardwareInfoReader : IHardwareInfoReader
{
    private readonly ILogger _logger;

    public WmiHardwareInfoReader(ILogger logger)
    {
        _logger = logger;
    }

    public HardwareInventoryData Read() => new()
    {
        Cpu = Query("SELECT Name FROM Win32_Processor", "Name"),
        CpuCores = QueryInt("SELECT NumberOfCores FROM Win32_Processor", "NumberOfCores"),
        RamTotalBytes = QueryLong("SELECT TotalPhysicalMemory FROM Win32_ComputerSystem", "TotalPhysicalMemory"),
        Disks = QueryDisks(),
        Gpu = Query("SELECT Name FROM Win32_VideoController", "Name"),
        Motherboard = QueryMotherboard(),
        BiosVersion = Query("SELECT SMBIOSBIOSVersion FROM Win32_BIOS", "SMBIOSBIOSVersion"),
        SerialNumber = Query("SELECT SerialNumber FROM Win32_BIOS", "SerialNumber"),
    };

    private List<DiskInfo> QueryDisks()
    {
        var disks = new List<DiskInfo>();
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Model, Size, SerialNumber FROM Win32_DiskDrive");
            foreach (ManagementBaseObject obj in searcher.Get())
            {
                using (obj)
                {
                    var model = obj["Model"]?.ToString();
                    if (string.IsNullOrEmpty(model)) continue;
                    long.TryParse(obj["Size"]?.ToString(), out var size);
                    disks.Add(new DiskInfo { Model = model, SizeBytes = size > 0 ? size : null, Serial = obj["SerialNumber"]?.ToString()?.Trim() });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not read disk inventory");
        }
        return disks;
    }

    private string? QueryMotherboard()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Manufacturer, Product FROM Win32_BaseBoard");
            foreach (ManagementBaseObject obj in searcher.Get())
            {
                using (obj)
                {
                    var manufacturer = obj["Manufacturer"]?.ToString();
                    var product = obj["Product"]?.ToString();
                    return string.Join(' ', new[] { manufacturer, product }.Where(s => !string.IsNullOrWhiteSpace(s)));
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not read motherboard info");
        }
        return null;
    }

    private string? Query(string wql, string property)
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(wql);
            foreach (ManagementBaseObject obj in searcher.Get())
            {
                using (obj)
                {
                    var value = obj[property]?.ToString()?.Trim();
                    if (!string.IsNullOrEmpty(value)) return value;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "WMI query failed: {Query}", wql);
        }
        return null;
    }

    private int? QueryInt(string wql, string property) => int.TryParse(Query(wql, property), out var v) ? v : null;

    private long? QueryLong(string wql, string property) => long.TryParse(Query(wql, property), out var v) ? v : null;
}
