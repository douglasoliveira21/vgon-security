using VgonAgent.Collectors.Usb;
using VgonAgent.Configuration;
using VgonAgent.Models;

namespace VgonAgent.Tests;

public sealed class UsbPolicyEvaluatorTests
{
    [Fact]
    public void Default_MONITOR_policy_reports_but_does_not_block_an_unlisted_device()
    {
        var decision = UsbPolicyEvaluator.Evaluate("0781", "5583", "ABC123", UsbPolicy.Monitor, []);

        Assert.Equal(UsbPolicyDecision.Monitored, decision);
    }

    [Fact]
    public void BLOCK_policy_blocks_a_device_not_on_the_allowlist()
    {
        var decision = UsbPolicyEvaluator.Evaluate("0781", "5583", "ABC123", UsbPolicy.Block, []);

        Assert.Equal(UsbPolicyDecision.Blocked, decision);
    }

    [Fact]
    public void An_allowlisted_device_is_always_allowed_even_under_BLOCK_policy()
    {
        var allowlist = new List<UsbAllowlistEntry> { new() { VendorId = "0781", ProductId = "5583" } };

        var decision = UsbPolicyEvaluator.Evaluate("0781", "5583", "ANY-SERIAL", UsbPolicy.Block, allowlist);

        Assert.Equal(UsbPolicyDecision.Allowed, decision);
    }

    [Fact]
    public void Allowlist_matching_on_vendor_and_product_only_ignores_serial_as_a_wildcard()
    {
        var allowlist = new List<UsbAllowlistEntry> { new() { VendorId = "0781", ProductId = "5583" } };

        var decisionA = UsbPolicyEvaluator.Evaluate("0781", "5583", "SERIAL-A", UsbPolicy.Block, allowlist);
        var decisionB = UsbPolicyEvaluator.Evaluate("0781", "5583", "SERIAL-B", UsbPolicy.Block, allowlist);

        Assert.Equal(UsbPolicyDecision.Allowed, decisionA);
        Assert.Equal(UsbPolicyDecision.Allowed, decisionB);
    }

    [Fact]
    public void A_device_matching_vendor_but_not_the_required_serial_is_not_allowlisted()
    {
        var allowlist = new List<UsbAllowlistEntry> { new() { VendorId = "0781", Serial = "EXPECTED-SERIAL" } };

        var decision = UsbPolicyEvaluator.Evaluate("0781", "5583", "DIFFERENT-SERIAL", UsbPolicy.Block, allowlist);

        Assert.Equal(UsbPolicyDecision.Blocked, decision);
    }

    [Fact]
    public void ALLOW_policy_allows_every_device_regardless_of_allowlist()
    {
        var decision = UsbPolicyEvaluator.Evaluate(null, null, null, UsbPolicy.Allow, []);

        Assert.Equal(UsbPolicyDecision.Allowed, decision);
    }
}
