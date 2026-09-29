using Microsoft.Extensions.Hosting.WindowsServices;
using VgonAgent.Collectors;
using VgonAgent.Collectors.Hardware;
using VgonAgent.Collectors.Printing;
using VgonAgent.Collectors.Security;
using VgonAgent.Collectors.Software;
using VgonAgent.Collectors.Usb;
using VgonAgent.Configuration;
using VgonAgent.Http;
using VgonAgent.Identity;
using VgonAgent.Policy;
using VgonAgent.Queue;
using VgonAgent.Rmm;
using VgonAgent.Screen;
using VgonAgent.Services;

// Helper-mode: this same executable, launched by the service inside the active interactive
// session (see IInteractiveProcessLauncher), to do the one thing that needs a real desktop — a
// screen capture, or a live-view session with its on-screen notice banner. Exits immediately
// rather than falling through to the normal Worker host below.
if (args.Length >= 2 && args[0] == "--capture-once")
{
    Environment.Exit(ScreenCaptureHelper.RunCaptureOnce(args[1]));
}
if (args.Length >= 3 && args[0] == "--live-view")
{
    Environment.Exit(ScreenCaptureHelper.RunLiveView(args[1], int.Parse(args[2])));
}

var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
{
    Args = args,
    ContentRootPath = WindowsServiceHelpers.IsWindowsService() ? AppContext.BaseDirectory : null,
});

builder.Services.AddWindowsService(options => options.ServiceName = "VgonSecurityPlusAgent");

// A collector crashing must never take the whole service down (section 6) — this is the
// last line of defense; each collector also catches its own exceptions internally.
builder.Services.Configure<Microsoft.Extensions.Hosting.HostOptions>(options =>
    options.BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.Ignore);

builder.Services.Configure<AgentOptions>(builder.Configuration.GetSection(AgentOptions.SectionName));

builder.Services.AddSingleton<ICredentialStore, DpapiCredentialStore>();
builder.Services.AddSingleton<IAccessTokenProvider, AccessTokenProvider>();
builder.Services.AddSingleton<IEventQueue, SqliteEventQueue>();
builder.Services.AddSingleton<ICollectorStatusRegistry, CollectorStatusRegistry>();
builder.Services.AddSingleton<IPolicyStore, PolicyStore>();
builder.Services.AddSingleton<ICollectionTrigger, CollectionTrigger>();
builder.Services.AddSingleton<ISystemActions, WindowsSystemActions>();
builder.Services.AddSingleton<IInteractiveProcessLauncher, WindowsInteractiveProcessLauncher>();
builder.Services.AddSingleton<IScreenViewSessionRunner, ScreenViewSessionRunner>();
builder.Services.AddSingleton<RemoteActionExecutor>();
builder.Services.AddSingleton<IUsbDeviceEnumerator>(sp =>
    new WmiUsbDeviceEnumerator(sp.GetRequiredService<ILoggerFactory>().CreateLogger("VgonAgent.UsbEnumerator")));
builder.Services.AddSingleton<IPrintJobEnumerator>(sp =>
    new WmiPrintJobEnumerator(sp.GetRequiredService<ILoggerFactory>().CreateLogger("VgonAgent.PrintJobEnumerator")));
builder.Services.AddSingleton<IHardwareInfoReader>(sp =>
    new WmiHardwareInfoReader(sp.GetRequiredService<ILoggerFactory>().CreateLogger("VgonAgent.HardwareInfoReader")));
builder.Services.AddSingleton<IInstalledSoftwareReader>(sp =>
    new RegistryInstalledSoftwareReader(sp.GetRequiredService<ILoggerFactory>().CreateLogger("VgonAgent.InstalledSoftwareReader")));
builder.Services.AddSingleton<ISecurityStateReader>(sp =>
    new WindowsSecurityStateReader(sp.GetRequiredService<ILoggerFactory>().CreateLogger("VgonAgent.SecurityStateReader")));

builder.Services.AddHttpClient<IVgonApiClient, VgonApiClient>((sp, client) =>
{
    var options = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<AgentOptions>>().Value;
    client.BaseAddress = new Uri(options.ApiBaseUrl.TrimEnd('/') + '/');
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddHttpClient("agent-update-download", client =>
{
    client.Timeout = TimeSpan.FromMinutes(5); // release artifacts can be tens of MB
});

builder.Services.AddHostedService<ProcessCollector>();
builder.Services.AddHostedService<BrowserCollector>();
builder.Services.AddHostedService<FileCollector>();
builder.Services.AddHostedService<UsbCollector>();
builder.Services.AddHostedService<PrinterCollector>();
builder.Services.AddHostedService<HardwareCollector>();
builder.Services.AddHostedService<SoftwareCollector>();
builder.Services.AddHostedService<SecurityCollector>();
builder.Services.AddHostedService<ScreenshotCollector>();
builder.Services.AddHostedService<EventUploaderService>();
builder.Services.AddHostedService<HeartbeatService>();
builder.Services.AddHostedService<PolicyRefreshService>();
builder.Services.AddHostedService<RemoteActionPollingService>();
builder.Services.AddHostedService<AgentUpdateService>();

var host = builder.Build();
host.Run();
