using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Collectors.Usb;
using VgonAgent.Configuration;
using VgonAgent.Models;
using VgonAgent.Policy;
using VgonAgent.Queue;

namespace VgonAgent.Collectors;

/// <summary>
/// IUsbCollector (section 10). Polls WMI for the connected-device set (more reliable under a
/// service account than a WM_DEVICECHANGE message-loop hook, which needs a window handle) and
/// diffs it against the previous poll. A device not covered by the allowlist is ALLOWED,
/// BLOCKED or MONITORED per policy; BLOCK defaults off (see AgentOptions.UsbDefaultPolicy) so
/// the Agent never disables a user's hardware unless an admin explicitly opts in.
/// </summary>
public sealed class UsbCollector : BackgroundService
{
    private const string CollectorName = "usb";

    private readonly IUsbDeviceEnumerator _enumerator;
    private readonly IEventQueue _queue;
    private readonly ICollectorStatusRegistry _status;
    private readonly IPolicyStore _policyStore;
    private readonly AgentOptions _options;
    private readonly ILogger<UsbCollector> _logger;

    private Dictionary<string, UsbDeviceInfo> _lastSnapshot = new();

    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

    private bool IsEnabled => _policyStore.Current.Collection.UsbCollectorEnabled ?? _options.UsbCollectorEnabled;
    private string DefaultPolicy => _policyStore.Current.Usb.DefaultPolicy ?? _options.UsbDefaultPolicy;

    private List<UsbAllowlistEntry> Allowlist =>
        _policyStore.Current.Usb.Allowlist?.Select(e => new UsbAllowlistEntry
        {
            VendorId = e.VendorId,
            ProductId = e.ProductId,
            Serial = e.Serial,
        }).ToList() ?? _options.UsbAllowlist;

    public UsbCollector(
        IUsbDeviceEnumerator enumerator,
        IEventQueue queue,
        ICollectorStatusRegistry status,
        IPolicyStore policyStore,
        IOptions<AgentOptions> options,
        ILogger<UsbCollector> logger)
    {
        _enumerator = enumerator;
        _queue = queue;
        _status = status;
        _policyStore = policyStore;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (IsEnabled)
        {
            try
            {
                _lastSnapshot = TakeSnapshot();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Initial USB enumeration failed; will retry next cycle");
            }
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.UsbCollectorPollIntervalSeconds), stoppingToken);

                if (!IsEnabled)
                {
                    _status.Report(CollectorName, CollectorState.STOPPED);
                    _lastSnapshot = new();
                    continue;
                }

                await PollOnceAsync(stoppingToken);
                _status.Report(CollectorName, CollectorState.RUNNING);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "USB collector poll failed; will retry next cycle");
                _status.Report(CollectorName, CollectorState.ERROR);
            }
        }

        _status.Report(CollectorName, CollectorState.STOPPED);
    }

    private async Task PollOnceAsync(CancellationToken ct)
    {
        var current = TakeSnapshot();

        foreach (var (deviceId, device) in current)
        {
            if (_lastSnapshot.ContainsKey(deviceId)) continue;
            await HandleConnectedAsync(device, ct);
        }

        foreach (var (deviceId, device) in _lastSnapshot)
        {
            if (current.ContainsKey(deviceId)) continue;
            await HandleDisconnectedAsync(device, ct);
        }

        _lastSnapshot = current;
    }

    private async Task HandleConnectedAsync(UsbDeviceInfo device, CancellationToken ct)
    {
        var decision = UsbPolicyEvaluator.Evaluate(
            device.VendorId, device.ProductId, device.Serial, DefaultPolicy, Allowlist);

        var blocked = false;
        if (decision == UsbPolicyDecision.Blocked)
        {
            blocked = _enumerator.TryDisable(device.DeviceId);
            _logger.LogWarning(
                "USB device {Model} ({DeviceId}) violates policy; disable {Result}",
                device.Model, device.DeviceId, blocked ? "succeeded" : "failed or unsupported for this device");
        }

        var data = new UsbEventData
        {
            VendorId = device.VendorId,
            ProductId = device.ProductId,
            Serial = device.Serial,
            Manufacturer = device.Manufacturer,
            Model = device.Model,
            CapacityBytes = device.CapacityBytes,
            PolicyDecision = decision,
            Blocked = blocked,
        };

        await Enqueue(EventType.UsbConnected, decision == UsbPolicyDecision.Blocked ? EventSeverity.High : EventSeverity.Info, data, ct);
    }

    private async Task HandleDisconnectedAsync(UsbDeviceInfo device, CancellationToken ct)
    {
        var data = new UsbEventData
        {
            VendorId = device.VendorId,
            ProductId = device.ProductId,
            Serial = device.Serial,
            Manufacturer = device.Manufacturer,
            Model = device.Model,
            CapacityBytes = device.CapacityBytes,
            PolicyDecision = UsbPolicyDecision.Monitored,
            Blocked = false,
        };

        await Enqueue(EventType.UsbDisconnected, EventSeverity.Info, data, ct);
    }

    private async Task Enqueue(string eventType, string severity, UsbEventData data, CancellationToken ct)
    {
        await _queue.EnqueueAsync(new EventEnvelope
        {
            AgentVersion = AgentVersion,
            Timestamp = DateTimeOffset.UtcNow.ToString("O"),
            EventType = eventType,
            Severity = severity,
            Data = data,
        }, ct);
    }

    private Dictionary<string, UsbDeviceInfo> TakeSnapshot() =>
        _enumerator.Enumerate().ToDictionary(d => d.DeviceId);
}
