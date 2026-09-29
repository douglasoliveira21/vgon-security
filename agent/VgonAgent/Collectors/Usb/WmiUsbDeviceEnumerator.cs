using System.Management;
using System.Runtime.Versioning;
using Microsoft.Extensions.Logging;

namespace VgonAgent.Collectors.Usb;

[SupportedOSPlatform("windows")]
public sealed class WmiUsbDeviceEnumerator : IUsbDeviceEnumerator
{
    private readonly ILogger _logger;

    public WmiUsbDeviceEnumerator(ILogger logger)
    {
        _logger = logger;
    }

    public IEnumerable<UsbDeviceInfo> Enumerate()
    {
        var capacities = ReadDiskCapacitiesByPnpId();
        var results = new List<UsbDeviceInfo>();

        using var searcher = new ManagementObjectSearcher(
            "SELECT DeviceID, Name, Manufacturer, PNPClass FROM Win32_PnPEntity WHERE DeviceID LIKE 'USB%'");

        foreach (ManagementBaseObject obj in searcher.Get())
        {
            using (obj)
            {
                var deviceId = obj["DeviceID"]?.ToString();
                if (string.IsNullOrEmpty(deviceId)) continue;

                // Root hubs and controllers aren't "a device the user plugged in" — skip the noise.
                var pnpClass = obj["PNPClass"]?.ToString();
                if (string.Equals(pnpClass, "USB", StringComparison.OrdinalIgnoreCase)) continue;

                var (vendorId, productId) = UsbDeviceIdParser.ParseVidPid(deviceId);
                var serial = UsbDeviceIdParser.ExtractSerial(deviceId);

                results.Add(new UsbDeviceInfo(
                    DeviceId: deviceId,
                    VendorId: vendorId,
                    ProductId: productId,
                    Serial: serial,
                    Manufacturer: obj["Manufacturer"]?.ToString(),
                    Model: obj["Name"]?.ToString() ?? deviceId,
                    CapacityBytes: capacities.TryGetValue(deviceId, out var capacity) ? capacity : null));
            }
        }

        return results;
    }

    public bool TryDisable(string deviceId)
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                $"SELECT * FROM Win32_PnPEntity WHERE DeviceID = '{EscapeForWql(deviceId)}'");
            foreach (ManagementBaseObject obj in searcher.Get())
            {
                using (obj)
                {
                    if (obj is not ManagementObject managementObject) continue;
                    var result = managementObject.InvokeMethod("Disable", null);
                    // Win32_PnPEntity.Disable returns 0 on success.
                    return result is uint code && code == 0;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to disable USB device {DeviceId}", deviceId);
        }
        return false;
    }

    // Chained from the PnP DeviceID (usually shared, or a close prefix, with Win32_DiskDrive's own
    // PNPDeviceID for the same physical device) so USB mass-storage devices get a capacity figure.
    private Dictionary<string, long> ReadDiskCapacitiesByPnpId()
    {
        var capacities = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT PNPDeviceID, Size FROM Win32_DiskDrive WHERE InterfaceType = 'USB'");
            foreach (ManagementBaseObject obj in searcher.Get())
            {
                using (obj)
                {
                    var pnpId = obj["PNPDeviceID"]?.ToString();
                    var sizeRaw = obj["Size"]?.ToString();
                    if (pnpId is not null && long.TryParse(sizeRaw, out var size))
                    {
                        capacities[pnpId] = size;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not read USB disk capacities");
        }
        return capacities;
    }

    private static string EscapeForWql(string value) => value.Replace("\\", "\\\\").Replace("'", "\\'");
}
