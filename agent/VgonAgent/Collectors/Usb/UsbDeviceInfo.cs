namespace VgonAgent.Collectors.Usb;

public sealed record UsbDeviceInfo(
    string DeviceId,
    string? VendorId,
    string? ProductId,
    string? Serial,
    string? Manufacturer,
    string Model,
    long? CapacityBytes);

public interface IUsbDeviceEnumerator
{
    IEnumerable<UsbDeviceInfo> Enumerate();

    /// <summary>Best-effort hardware disable for a BLOCK-policy device. Returns whether it succeeded.</summary>
    bool TryDisable(string deviceId);
}
