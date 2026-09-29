using VgonAgent.Collectors.Software;
using VgonAgent.Models;

namespace VgonAgent.Tests;

public sealed class SoftwareDifferTests
{
    private static SoftwareItem Item(string name, string? version = "1.0") => new() { Name = name, Version = version };

    [Fact]
    public void Everything_is_added_when_there_is_no_previous_snapshot()
    {
        var current = new[] { Item("Notepad++"), Item("7-Zip") };

        var diff = SoftwareDiffer.Diff(current, new Dictionary<string, SoftwareItem>());

        Assert.Equal(2, diff.Added.Count);
        Assert.Empty(diff.Removed);
    }

    [Fact]
    public void Unchanged_software_produces_no_diff()
    {
        var current = new[] { Item("Notepad++") };
        var previous = current.ToDictionary(SoftwareDiffer.Key);

        var diff = SoftwareDiffer.Diff(current, previous);

        Assert.Empty(diff.Added);
        Assert.Empty(diff.Removed);
    }

    [Fact]
    public void Newly_installed_software_is_reported_as_added_only()
    {
        var previous = new[] { Item("Notepad++") }.ToDictionary(SoftwareDiffer.Key);
        var current = new[] { Item("Notepad++"), Item("Slack") };

        var diff = SoftwareDiffer.Diff(current, previous);

        Assert.Single(diff.Added);
        Assert.Equal("Slack", diff.Added[0].Name);
        Assert.Empty(diff.Removed);
    }

    [Fact]
    public void Uninstalled_software_is_reported_as_removed_only()
    {
        var previous = new[] { Item("Notepad++"), Item("Slack") }.ToDictionary(SoftwareDiffer.Key);
        var current = new[] { Item("Notepad++") };

        var diff = SoftwareDiffer.Diff(current, previous);

        Assert.Empty(diff.Added);
        Assert.Single(diff.Removed);
        Assert.Equal("Slack", diff.Removed[0].Name);
    }

    [Fact]
    public void A_version_upgrade_is_reported_as_a_removal_of_the_old_version_and_an_addition_of_the_new_one()
    {
        var previous = new[] { Item("Notepad++", "8.5") }.ToDictionary(SoftwareDiffer.Key);
        var current = new[] { Item("Notepad++", "8.6") };

        var diff = SoftwareDiffer.Diff(current, previous);

        Assert.Single(diff.Added);
        Assert.Equal("8.6", diff.Added[0].Version);
        Assert.Single(diff.Removed);
        Assert.Equal("8.5", diff.Removed[0].Version);
    }

    [Fact]
    public void Two_different_versions_of_the_same_app_can_coexist_without_diffing_against_each_other()
    {
        var previous = new[] { Item("Python", "3.11") }.ToDictionary(SoftwareDiffer.Key);
        var current = new[] { Item("Python", "3.11"), Item("Python", "3.12") };

        var diff = SoftwareDiffer.Diff(current, previous);

        Assert.Single(diff.Added);
        Assert.Equal("3.12", diff.Added[0].Version);
        Assert.Empty(diff.Removed);
    }
}
