namespace VgonAgent.Configuration;

// Bound from appsettings.json ("Agent" section) and environment variables (VGON_AGENT__*).
public sealed class AgentOptions
{
    public const string SectionName = "Agent";

    /// <summary>Base URL of the Cloud API, e.g. https://api.vgon-security.example/api/v1</summary>
    public string ApiBaseUrl { get; set; } = "http://localhost:4000/api/v1";

    /// <summary>
    /// Provisioning token used only on first run, when no local credential exists yet.
    /// Provided by the installer (from a provisioning token generated in the dashboard).
    /// Cleared from config after a successful registration is not required since the
    /// server invalidates it server-side after first use anyway.
    /// </summary>
    public string? ProvisioningToken { get; set; }

    public int HeartbeatIntervalSeconds { get; set; } = 60;

    public int EventUploadIntervalSeconds { get; set; } = 15;

    /// <summary>How often to poll GET /agents/policy (section 16). The last successfully
    /// fetched policy is cached to disk and keeps applying if this call starts failing.</summary>
    public int PolicyRefreshIntervalSeconds { get; set; } = 300;

    public int EventUploadBatchSize { get; set; } = 100;

    public int ProcessCollectorPollIntervalSeconds { get; set; } = 5;

    public bool ProcessCollectorEnabled { get; set; } = true;

    /// <summary>
    /// Configurable denylist for the "processos potencialmente suspeitos" rule (section 7).
    /// Case-insensitive match on the process executable name. Intended for obvious
    /// off-the-shelf offensive tooling — not a substitute for the Security Collector (Phase 5+).
    /// </summary>
    public List<string> SuspiciousProcessNames { get; set; } =
        ["mimikatz.exe", "psexec.exe", "procdump.exe", "pwdump.exe"];

    /// <summary>Directory for the local SQLite event queue and the DPAPI-protected credential file.</summary>
    public string DataDirectory { get; set; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "VgonSecurityPlus");

    // ---- Browser Collector (section 8) ----

    public bool BrowserCollectorEnabled { get; set; } = true;

    public int BrowserCollectorPollIntervalSeconds { get; set; } = 30;

    /// <summary>
    /// How much of a visited URL is reported: FULL_URL, DOMAIN_ONLY, or SANITIZED_URL
    /// (default — keeps the URL structure but redacts sensitive query parameters and
    /// always strips fragments). Never captures page content regardless of policy.
    /// </summary>
    public string BrowserUrlPolicy { get; set; } = Models.BrowserUrlPolicy.SanitizedUrl;

    /// <summary>
    /// Query parameter names (case-insensitive, substring match) whose values are redacted
    /// under SANITIZED_URL — tokens, session ids, passwords, API keys (section 8).
    /// </summary>
    public List<string> SensitiveUrlParams { get; set; } =
        ["token", "session", "password", "pwd", "secret", "key", "auth", "sig", "signature", "credential"];

    // ---- File Collector (section 9) ----

    public bool FileCollectorEnabled { get; set; } = true;

    /// <summary>
    /// Folders watched under EVERY enrolled user's profile, relative to `C:\Users\<user>`.
    /// Deliberately narrow by default — indiscriminately watching system directories is both
    /// noisy and expensive (section 9: "evitar monitoramento indiscriminado").
    /// </summary>
    public List<string> FileWatchFolders { get; set; } = ["Desktop", "Documents", "Downloads"];

    /// <summary>Extensions excluded from reporting (case-insensitive, with leading dot) — mainly
    /// transient/noise files (browser downloads-in-progress, editor swap files, thumbnails).</summary>
    public List<string> FileExcludedExtensions { get; set; } =
        [".tmp", ".temp", ".crdownload", ".partial", ".log", ".ds_store"];

    /// <summary>
    /// FileSystemWatcher's Changed event fires repeatedly while a file is being written; this
    /// window collapses bursts for the same path into a single file.modified event.
    /// </summary>
    public int FileChangeDebounceSeconds { get; set; } = 2;

    // ---- USB Collector (section 10) ----

    public bool UsbCollectorEnabled { get; set; } = true;

    public int UsbCollectorPollIntervalSeconds { get; set; } = 5;

    /// <summary>
    /// Default disposition for a USB device that doesn't match <see cref="UsbAllowlist"/>:
    /// ALLOW, BLOCK, or MONITOR (default — detect and report only, never disable hardware
    /// without an explicit opt-in, since that's a disruptive action on someone's machine).
    /// </summary>
    public string UsbDefaultPolicy { get; set; } = Models.UsbPolicy.Monitor;

    public List<UsbAllowlistEntry> UsbAllowlist { get; set; } = [];

    // ---- Printer Collector (section 11) ----

    public bool PrinterCollectorEnabled { get; set; } = true;

    public int PrinterCollectorPollIntervalSeconds { get; set; } = 5;

    // ---- Hardware / Software / Security inventory (sections 12, 13) ----
    // Hardware barely changes and software/security checks aren't cheap (registry + WMI + a
    // directory-services lookup), so these run far less often than the other collectors.

    public bool HardwareCollectorEnabled { get; set; } = true;

    public int HardwareCollectorIntervalSeconds { get; set; } = 6 * 60 * 60; // 6 hours

    public bool SoftwareCollectorEnabled { get; set; } = true;

    public int SoftwareCollectorIntervalSeconds { get; set; } = 60 * 60; // 1 hour

    public bool SecurityCollectorEnabled { get; set; } = true;

    public int SecurityCollectorIntervalSeconds { get; set; } = 30 * 60; // 30 minutes

    // ---- RMM: remote actions (section 26/Phase 7) ----

    public int RemoteActionPollIntervalSeconds { get; set; } = 30;

    // ---- Agent auto-update (section 24) ----

    public bool UpdatesEnabled { get; set; } = true;

    /// <summary>STABLE or BETA — which <c>AgentRelease</c> channel this device tracks.</summary>
    public string UpdateChannel { get; set; } = "STABLE";

    public int UpdateCheckIntervalSeconds { get; set; } = 6 * 60 * 60; // 6 hours
}

/// <summary>A USB device always ALLOWED regardless of <see cref="AgentOptions.UsbDefaultPolicy"/>,
/// matched by any combination of vendor id, product id and/or serial (unset fields are wildcards).</summary>
public sealed class UsbAllowlistEntry
{
    public string? VendorId { get; set; }
    public string? ProductId { get; set; }
    public string? Serial { get; set; }
}
