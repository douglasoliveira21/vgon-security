using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Policy;

namespace VgonAgent.Tests;

public sealed class PolicyStoreTests : IDisposable
{
    private readonly string _tempDir;

    public PolicyStoreTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "vgon-policy-store-tests-" + Guid.NewGuid());
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { /* best-effort cleanup */ }
    }

    private PolicyStore MakeStore() =>
        new(Options.Create(new AgentOptions { DataDirectory = _tempDir }), NullLogger<PolicyStore>.Instance);

    [Fact]
    public void Starts_with_an_all_defaults_policy_when_nothing_was_ever_cached()
    {
        var store = MakeStore();

        // Every field null means every collector falls back to its own local AgentOptions default.
        Assert.Null(store.Current.Browser.UrlPolicy);
        Assert.Equal(0, store.Current.Version);
    }

    [Fact]
    public void Update_makes_the_new_policy_immediately_available_via_Current()
    {
        var store = MakeStore();
        var policy = new EffectivePolicy { Version = 42, Usb = new UsbPolicySettings { DefaultPolicy = "BLOCK" } };

        store.Update(policy);

        Assert.Equal(42, store.Current.Version);
        Assert.Equal("BLOCK", store.Current.Usb.DefaultPolicy);
    }

    [Fact]
    public void Cached_policy_survives_a_restart_by_reloading_from_the_persisted_file()
    {
        var policy = new EffectivePolicy { Version = 7, Collection = new CollectionPolicySettings { UsbCollectorEnabled = false } };
        MakeStore().Update(policy);

        var afterRestart = MakeStore(); // simulates the Agent service restarting

        Assert.Equal(7, afterRestart.Current.Version);
        Assert.False(afterRestart.Current.Collection.UsbCollectorEnabled);
    }
}
