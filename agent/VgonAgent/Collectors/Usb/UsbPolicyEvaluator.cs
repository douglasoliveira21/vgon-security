using VgonAgent.Configuration;
using VgonAgent.Models;

namespace VgonAgent.Collectors.Usb;

/// <summary>
/// Decides what to do with a detected USB device (section 10). Pure and side-effect free —
/// actually disabling hardware is a separate step the collector takes based on this result.
/// </summary>
public static class UsbPolicyEvaluator
{
    public static string Evaluate(
        string? vendorId,
        string? productId,
        string? serial,
        string defaultPolicy,
        IReadOnlyList<UsbAllowlistEntry> allowlist)
    {
        if (IsAllowlisted(vendorId, productId, serial, allowlist))
        {
            return UsbPolicyDecision.Allowed;
        }

        return defaultPolicy switch
        {
            UsbPolicy.Allow => UsbPolicyDecision.Allowed,
            UsbPolicy.Block => UsbPolicyDecision.Blocked,
            _ => UsbPolicyDecision.Monitored,
        };
    }

    private static bool IsAllowlisted(string? vendorId, string? productId, string? serial, IReadOnlyList<UsbAllowlistEntry> allowlist)
    {
        return allowlist.Any(entry =>
            Matches(entry.VendorId, vendorId) &&
            Matches(entry.ProductId, productId) &&
            Matches(entry.Serial, serial));
    }

    // An unset field on the allowlist entry acts as a wildcard for that field.
    private static bool Matches(string? expected, string? actual) =>
        expected is null || string.Equals(expected, actual, StringComparison.OrdinalIgnoreCase);
}
