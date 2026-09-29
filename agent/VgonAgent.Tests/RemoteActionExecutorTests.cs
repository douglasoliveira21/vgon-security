using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;
using VgonAgent.Policy;
using VgonAgent.Rmm;
using VgonAgent.Screen;

namespace VgonAgent.Tests;

public sealed class FakeSystemActions : ISystemActions
{
    public int LockCalls { get; private set; }
    public bool LockResult { get; set; } = true;
    public int ExitCalls { get; private set; }

    public bool LockActiveSession()
    {
        LockCalls++;
        return LockResult;
    }

    public void ExitForRestart() => ExitCalls++;
}

public sealed class FakeScreenViewSessionRunner : IScreenViewSessionRunner
{
    public List<string> StartedActionIds { get; } = [];
    public bool NextTryStartResult { get; set; } = true;

    public bool TryStart(string actionId)
    {
        if (!NextTryStartResult) return false;
        StartedActionIds.Add(actionId);
        return true;
    }
}

public sealed class RemoteActionExecutorTests : IDisposable
{
    private readonly string _tempDir;

    public RemoteActionExecutorTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "vgon-remote-action-tests-" + Guid.NewGuid());
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { /* best-effort cleanup */ }
    }

    private (RemoteActionExecutor Executor, FakeSystemActions SystemActions, CollectionTrigger Trigger, PolicyStore PolicyStore, FakeVgonApiClient Api, FakeScreenViewSessionRunner ScreenViewRunner)
        MakeExecutor()
    {
        var policyStore = new PolicyStore(Options.Create(new AgentOptions { DataDirectory = _tempDir }), NullLogger<PolicyStore>.Instance);
        var trigger = new CollectionTrigger();
        var systemActions = new FakeSystemActions();
        var api = new FakeVgonApiClient();
        var screenViewRunner = new FakeScreenViewSessionRunner();
        var credentialStore = new FakeCredentialStore();
        credentialStore.Save(new VgonAgent.Identity.DeviceCredentials("device-1", "refresh-token"));
        var tokenProvider = new VgonAgent.Identity.AccessTokenProvider(
            api, credentialStore, Options.Create(new AgentOptions()), NullLogger<VgonAgent.Identity.AccessTokenProvider>.Instance);

        var executor = new RemoteActionExecutor(policyStore, trigger, systemActions, api, tokenProvider, screenViewRunner, NullLogger<RemoteActionExecutor>.Instance);
        return (executor, systemActions, trigger, policyStore, api, screenViewRunner);
    }

    private static PendingRemoteAction Action(string type) => new() { Id = "action-1", Type = type, RequestedAt = DateTimeOffset.UtcNow.ToString("O") };

    [Fact]
    public async Task REFRESH_POLICY_fetches_and_applies_the_latest_policy()
    {
        var (executor, _, _, policyStore, _, _) = MakeExecutor();

        var result = await executor.ExecuteAsync(Action(RemoteActionType.RefreshPolicy), CancellationToken.None);

        Assert.True(result.Success);
        // FakeVgonApiClient.GetPolicyAsync returns a fresh EffectivePolicy — confirms the
        // executor actually called Update() on the store rather than just fetching and discarding it.
        Assert.NotNull(policyStore.Current);
    }

    [Fact]
    public async Task COLLECT_INVENTORY_wakes_all_three_inventory_collectors()
    {
        var (executor, _, trigger, _, _, _) = MakeExecutor();

        var result = await executor.ExecuteAsync(Action(RemoteActionType.CollectInventory), CancellationToken.None);

        Assert.True(result.Success);
        // If TriggerNow was actually called for each, WaitOrDelayAsync returns immediately.
        foreach (var name in new[] { "hardware", "software", "security" })
        {
            var start = DateTimeOffset.UtcNow;
            await trigger.WaitOrDelayAsync(name, TimeSpan.FromSeconds(10), CancellationToken.None);
            Assert.True(DateTimeOffset.UtcNow - start < TimeSpan.FromSeconds(5), $"{name} was not triggered");
        }
    }

    [Fact]
    public async Task LOCK_SESSION_calls_into_system_actions_and_reports_success_when_it_worked()
    {
        var (executor, systemActions, _, _, _, _) = MakeExecutor();
        systemActions.LockResult = true;

        var result = await executor.ExecuteAsync(Action(RemoteActionType.LockSession), CancellationToken.None);

        Assert.Equal(1, systemActions.LockCalls);
        Assert.True(result.Success);
    }

    [Fact]
    public async Task LOCK_SESSION_reports_failure_when_no_active_session_was_found()
    {
        var (executor, systemActions, _, _, _, _) = MakeExecutor();
        systemActions.LockResult = false;

        var result = await executor.ExecuteAsync(Action(RemoteActionType.LockSession), CancellationToken.None);

        Assert.False(result.Success);
        Assert.NotNull(result.ErrorMessage);
    }

    [Fact]
    public async Task RESTART_AGENT_reports_success_without_exiting_the_process_itself()
    {
        var (executor, systemActions, _, _, _, _) = MakeExecutor();

        var result = await executor.ExecuteAsync(Action(RemoteActionType.RestartAgent), CancellationToken.None);

        Assert.True(result.Success);
        // Exiting is the polling service's job, AFTER it reports completion to the Cloud —
        // the executor itself must never call it directly.
        Assert.Equal(0, systemActions.ExitCalls);
    }

    [Fact]
    public async Task CAPTURE_SCREENSHOT_wakes_the_screenshot_collector_and_completes_immediately()
    {
        var (executor, _, trigger, _, _, _) = MakeExecutor();

        var result = await executor.ExecuteAsync(Action(RemoteActionType.CaptureScreenshot), CancellationToken.None);

        Assert.True(result.Success);
        Assert.False(result.Deferred);
        var start = DateTimeOffset.UtcNow;
        await trigger.WaitOrDelayAsync("screenshot", TimeSpan.FromSeconds(10), CancellationToken.None);
        Assert.True(DateTimeOffset.UtcNow - start < TimeSpan.FromSeconds(5), "screenshot collector was not triggered");
    }

    [Fact]
    public async Task START_SCREEN_VIEW_starts_the_session_runner_and_defers_completion()
    {
        var (executor, _, _, _, _, screenViewRunner) = MakeExecutor();

        var result = await executor.ExecuteAsync(Action(RemoteActionType.StartScreenView), CancellationToken.None);

        Assert.True(result.Success);
        // The runner (not the executor's caller) reports completion once the session actually
        // ends, minutes from now — the polling loop must not call the completion endpoint itself.
        Assert.True(result.Deferred);
        Assert.Equal(["action-1"], screenViewRunner.StartedActionIds);
    }

    [Fact]
    public async Task START_SCREEN_VIEW_fails_immediately_when_a_session_is_already_active()
    {
        var (executor, _, _, _, _, screenViewRunner) = MakeExecutor();
        screenViewRunner.NextTryStartResult = false;

        var result = await executor.ExecuteAsync(Action(RemoteActionType.StartScreenView), CancellationToken.None);

        Assert.False(result.Success);
        Assert.False(result.Deferred);
        Assert.Contains("already active", result.ErrorMessage);
    }

    [Fact]
    public async Task An_unknown_action_type_fails_cleanly_instead_of_throwing()
    {
        var (executor, _, _, _, _, _) = MakeExecutor();

        var result = await executor.ExecuteAsync(Action("SOMETHING_MADE_UP"), CancellationToken.None);

        Assert.False(result.Success);
        Assert.Contains("Unknown", result.ErrorMessage);
    }
}
