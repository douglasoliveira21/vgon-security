using VgonAgent.Update;

namespace VgonAgent.Tests;

public sealed class UpdateScriptBuilderTests
{
    [Fact]
    public void Script_stops_the_service_before_touching_any_files()
    {
        var script = UpdateScriptBuilder.Build("VgonSecurityPlusAgent", @"C:\Program Files\Agent", @"C:\staged\pkg.zip", @"C:\backup");

        var stopIndex = script.IndexOf("Stop-Service", StringComparison.Ordinal);
        var copyIndex = script.IndexOf("Copy-Item", StringComparison.Ordinal);
        var expandIndex = script.IndexOf("Expand-Archive", StringComparison.Ordinal);

        Assert.True(stopIndex >= 0 && stopIndex < copyIndex);
        Assert.True(copyIndex < expandIndex);
    }

    [Fact]
    public void Script_backs_up_before_applying_the_new_package()
    {
        var script = UpdateScriptBuilder.Build("Svc", @"C:\install", @"C:\staged\pkg.zip", @"C:\backup");

        var backupIndex = script.IndexOf("Copy-Item -Path \"$installDir\\*\" -Destination $backupDir", StringComparison.Ordinal);
        var applyIndex = script.IndexOf("Expand-Archive -Path $stagedZip", StringComparison.Ordinal);

        Assert.True(backupIndex >= 0);
        Assert.True(backupIndex < applyIndex);
    }

    [Fact]
    public void Script_includes_a_rollback_path_on_failure()
    {
        var script = UpdateScriptBuilder.Build("Svc", @"C:\install", @"C:\staged\pkg.zip", @"C:\backup");

        Assert.Contains("catch", script);
        Assert.Contains("Rolling back", script);
        // The rollback copies FROM the backup dir back INTO the install dir.
        Assert.Contains("Copy-Item -Path \"$backupDir\\*\" -Destination $installDir", script);
    }

    [Fact]
    public void Script_verifies_the_service_is_actually_running_after_starting_it()
    {
        var script = UpdateScriptBuilder.Build("Svc", @"C:\install", @"C:\staged\pkg.zip", @"C:\backup");

        Assert.Contains("Get-Service", script);
        Assert.Contains("Running", script);
    }

    [Fact]
    public void Embeds_the_exact_service_name_and_paths_passed_in()
    {
        var script = UpdateScriptBuilder.Build("MyCustomService", @"C:\custom\install", @"C:\custom\staged.zip", @"C:\custom\backup");

        Assert.Contains("$serviceName = 'MyCustomService'", script);
        Assert.Contains(@"$installDir = 'C:\custom\install'", script);
        Assert.Contains(@"$stagedZip = 'C:\custom\staged.zip'", script);
        Assert.Contains(@"$backupDir = 'C:\custom\backup'", script);
    }
}
