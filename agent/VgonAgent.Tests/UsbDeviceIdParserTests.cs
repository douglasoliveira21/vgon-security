using VgonAgent.Collectors.Usb;

namespace VgonAgent.Tests;

public sealed class UsbDeviceIdParserTests
{
    [Fact]
    public void Parses_vendor_and_product_id_from_a_typical_device_id()
    {
        var (vendorId, productId) = UsbDeviceIdParser.ParseVidPid(@"USB\VID_0781&PID_5583\4C531001331122117240");

        Assert.Equal("0781", vendorId);
        Assert.Equal("5583", productId);
    }

    [Fact]
    public void Parsing_is_case_insensitive()
    {
        var (vendorId, productId) = UsbDeviceIdParser.ParseVidPid(@"USB\Vid_0781&Pid_5583\SomeSerial");

        Assert.Equal("0781", vendorId);
        Assert.Equal("5583", productId);
    }

    [Fact]
    public void Returns_null_for_a_device_id_without_VID_PID()
    {
        var (vendorId, productId) = UsbDeviceIdParser.ParseVidPid(@"USB\ROOT_HUB30\4&1a2b3c4d&0");

        Assert.Null(vendorId);
        Assert.Null(productId);
    }

    [Fact]
    public void Extracts_a_real_looking_serial_from_the_last_segment()
    {
        var serial = UsbDeviceIdParser.ExtractSerial(@"USB\VID_0781&PID_5583\4C531001331122117240");

        Assert.Equal("4C531001331122117240", serial);
    }

    [Theory]
    [InlineData(@"USB\VID_046D&PID_C52B\6&2f1c3a9&0&2")]
    [InlineData(@"USB\ROOT_HUB30\4&1a2b3c4d&0")]
    public void Treats_a_synthesized_windows_instance_id_as_no_serial(string deviceId)
    {
        Assert.Null(UsbDeviceIdParser.ExtractSerial(deviceId));
    }
}
