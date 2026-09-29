using VgonAgent.Collectors.Software;
using VgonAgent.Models;

namespace VgonAgent.Tests;

public sealed class SoftwareSnapshotStoreTests : IDisposable
{
    private readonly string _tempDir;

    public SoftwareSnapshotStoreTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "vgon-software-snapshot-tests-" + Guid.NewGuid());
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { /* best-effort cleanup */ }
    }

    [Fact]
    public void Load_returns_empty_when_nothing_was_ever_saved()
    {
        var store = new SoftwareSnapshotStore(_tempDir);

        Assert.Empty(store.Load());
    }

    [Fact]
    public void Saved_snapshot_survives_a_new_store_instance_simulating_a_restart()
    {
        var items = new List<SoftwareItem> { new() { Name = "7-Zip", Version = "23.01" } };
        new SoftwareSnapshotStore(_tempDir).Save(items);

        var reloaded = new SoftwareSnapshotStore(_tempDir).Load();

        Assert.True(reloaded.ContainsKey(SoftwareDiffer.Key(items[0])));
    }

    [Fact]
    public void Full_sync_is_due_until_marked_then_again_after_the_interval()
    {
        var store = new SoftwareSnapshotStore(_tempDir);
        var now = new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        var interval = TimeSpan.FromHours(24);

        Assert.True(store.IsFullSyncDue(now, interval));

        store.MarkFullSync(now);

        Assert.False(store.IsFullSyncDue(now.AddHours(23), interval));
        Assert.True(store.IsFullSyncDue(now.AddHours(24), interval));
        Assert.False(new SoftwareSnapshotStore(_tempDir).IsFullSyncDue(now.AddHours(1), interval));
    }
}
