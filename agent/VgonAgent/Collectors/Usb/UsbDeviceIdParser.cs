using System.Text.RegularExpressions;

namespace VgonAgent.Collectors.Usb;

/// <summary>Parses the pieces section 10 asks for (vendor, product, serial) out of a Windows
/// PnP DeviceID string. Pure/testable, separate from the WMI enumeration that produces the ID.</summary>
public static partial class UsbDeviceIdParser
{
    public static (string? VendorId, string? ProductId) ParseVidPid(string deviceId)
    {
        var match = VidPidRegex().Match(deviceId);
        return match.Success ? (match.Groups["vid"].Value, match.Groups["pid"].Value) : (null, null);
    }

    public static string? ExtractSerial(string deviceId)
    {
        var lastSegment = deviceId.Split('\\').LastOrDefault();
        // A real serial is stable across replugs; Windows synthesizes an id ending in "&..." for
        // devices without one (e.g. "&0", "&1&0000"), which isn't a serial — treat it as absent
        // rather than reporting a misleading value.
        if (string.IsNullOrEmpty(lastSegment) || lastSegment.Contains('&')) return null;
        return lastSegment;
    }

    // Windows itself always emits DeviceIDs with uppercase "VID_"/"PID_", but IgnoreCase costs
    // nothing and avoids depending on that being true for every driver on every Windows version.
    [GeneratedRegex(@"VID_(?<vid>[0-9A-Fa-f]{4}).*PID_(?<pid>[0-9A-Fa-f]{4})", RegexOptions.IgnoreCase)]
    private static partial Regex VidPidRegex();
}
