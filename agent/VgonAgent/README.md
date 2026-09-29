# VGON Security+ Agent

.NET 10 Worker Service that runs as a Windows Service on enrolled endpoints.

- Registers itself with a one-time provisioning token, stores its device-unique refresh token encrypted with DPAPI (`%ProgramData%\VgonSecurityPlus\credentials.bin`)
- Sends a periodic heartbeat (`Agent:HeartbeatIntervalSeconds`, default 60s)
- **Process Collector**: polls the process table every `Agent:ProcessCollectorPollIntervalSeconds` (default 5s), enqueues `process.started` / `process.stopped`, flags a configurable denylist (`Agent:SuspiciousProcessNames`) as suspicious
- **Browser Collector**: reads Chrome/Edge (`History`) and Firefox (`places.sqlite`) history databases every `Agent:BrowserCollectorPollIntervalSeconds` (default 30s) across every enrolled Windows user profile, emits `browser.navigation` events. URLs are filtered by `Agent:BrowserUrlPolicy` (`FULL_URL` / `DOMAIN_ONLY` / `SANITIZED_URL`, default `SANITIZED_URL` — redacts query params matching `Agent:SensitiveUrlParams` and always strips fragments) **before** the event is queued, not after. Never touches page content, and never reads a browser's live database file directly — it's copied to a temp file first so a running browser is never blocked or interfered with.
- **File Collector**: `FileSystemWatcher` over `Agent:FileWatchFolders` (default Desktop/Documents/Downloads) in every enrolled user's profile — event-driven, not polled. Emits `file.created`/`modified`/`renamed`/`deleted` with metadata only (path/name/extension/size/user); never opens file content. Noisy extensions/folders are excluded by default (`Agent:FileExcludedExtensions`), and rapid `Changed` bursts from a single save are debounced (`Agent:FileChangeDebounceSeconds`).
- **USB Collector**: polls WMI every `Agent:UsbCollectorPollIntervalSeconds` (default 5s) for the connected-device set, diffs it, and classifies each new device as `ALLOWED`/`BLOCKED`/`MONITORED` per `Agent:UsbDefaultPolicy` (default `MONITOR`) and `Agent:UsbAllowlist` (vendor/product/serial). Under `BLOCK`, attempts to actually disable the device via WMI and reports whether it succeeded (`usb.connected`/`usb.disconnected`).
- **Printer Collector**: polls `Win32_PrintJob` via WMI every `Agent:PrinterCollectorPollIntervalSeconds` (default 5s), reports each job once as `printer.job` (printer name, document name, owner, pages) — document content is never available through WMI in the first place.
- **Hardware Collector**: WMI-based (CPU, RAM, disks, GPU, motherboard, BIOS, serial), every `Agent:HardwareCollectorIntervalSeconds` (default 6h) — hardware doesn't change at runtime, so this just resends the full (small) snapshot rather than diffing.
- **Software Collector**: reads the Add/Remove Programs registry locations (both 64- and 32-bit views; deliberately not WMI's `Win32_Product`, which can trigger a repair of every MSI on the machine), diffs against a snapshot persisted across restarts (`%ProgramData%\VgonSecurityPlus\software-snapshot.json`), and only sends what changed every `Agent:SoftwareCollectorIntervalSeconds` (default 1h) — the first-ever run's "added" list is the one-time full inventory.
- **Security Collector**: reports Defender/Firewall/BitLocker/Secure Boot/TPM/UAC state and local administrator accounts every `Agent:SecurityCollectorIntervalSeconds` (default 30m). Every field is independently best-effort: a check that fails or needs elevation the Agent doesn't have comes back `null` ("couldn't determine"), never a guessed value — the Cloud's rule evaluator treats unknown as unknown, not insecure. **Not implemented**: a real pending-critical-Windows-updates count, which needs the Windows Update Agent COM API (`IUpdateSearcher.Search()`) — that call can take tens of seconds and hits Microsoft's servers, which isn't appropriate for a background collector's regular cadence; it needs its own, much less frequent (e.g. daily) check, deferred past Phase 5.
- Buffers events in a local SQLite queue (`%ProgramData%\VgonSecurityPlus\event-queue.sqlite`) so it keeps working offline, and uploads batches to the Cloud every `Agent:EventUploadIntervalSeconds` (default 15s) with retry/backoff and idempotent `eventId`s
- **Policy Engine client** (section 16): polls `GET /agents/policy` every `Agent:PolicyRefreshIntervalSeconds` (default 5m) and caches the resolved policy to disk (`%ProgramData%\VgonSecurityPlus\policy-cache.json`) — a Cloud outage leaves every collector applying the last policy successfully received, not silently reverting to local defaults. Every collector's enable/disable is policy-driven (`CollectionPolicy`, checked once per poll cycle — toggling a collector off from the dashboard takes effect within one cycle, no restart); the Browser Collector's URL policy/sensitive-params and the USB Collector's default-policy/allowlist are policy-driven too. See the root README's Phase 6 section for which settings aren't wired through yet.
- **RMM: remote actions** (section 26): polls `GET /agents/actions/pending` every `Agent:RemoteActionPollIntervalSeconds` (default 30s) and executes exactly four safe, fixed actions — never arbitrary commands. `COLLECT_INVENTORY` wakes the Hardware/Software/Security collectors immediately via `ICollectionTrigger` (they'd otherwise be asleep for up to hours). `LOCK_SESSION` uses `WTSDisconnectSession` (not `LockWorkStation`) since the Agent runs in Session 0 as `LocalSystem` and has no interactive session of its own to lock. `RESTART_AGENT` exits the process — actually restarting it depends on Windows Service Recovery being configured (see "Install as a Windows Service" below). Every outcome is reported back via `POST /agents/actions/:id/complete`.
- **Agent auto-update** (section 24): checks `GET /agents/updates/latest?channel=` every `Agent:UpdateCheckIntervalSeconds` (default 6h, channel via `Agent:UpdateChannel`, default `STABLE`). A newer version (real semver comparison) is downloaded and its SHA-256 verified against what the Cloud published *before anything else happens* — a mismatch is logged as a security event and the download is discarded, never installed. On a match, a PowerShell script is generated (stop service → back up → apply → start → verify running → roll back on any failure) and launched as a detached process, since the running `.exe` can't replace its own file.

## Build & test

```bash
cd agent
dotnet build VgonAgent.slnx
dotnet test VgonAgent.slnx
```

Requires the .NET 10 SDK. Targets `net10.0-windows` — it only runs on Windows (DPAPI, process inspection, WMI, registry, `C:\Users\*` enumeration, wtsapi32). `VgonAgent.Tests` (93 tests) covers the SQLite queue, the access-token lifecycle, the URL sanitizer, the Chromium history reader against a real seeded SQLite fixture, the file-event filter, USB device-id parsing and policy evaluation, print-job name parsing, the software inventory differ plus its cross-restart snapshot persistence, the policy cache's cross-restart persistence, the `ICollectionTrigger` wake-vs-timeout race, `RemoteActionExecutor`'s dispatch logic (with fakes for the OS-level effects), SemVer comparison (including "1.10.0 > 1.9.0" numerically, not lexically), real SHA-256 verification (known test vectors, tamper detection), and the generated update script's command ordering (stop-before-copy, backup-before-apply, rollback-on-failure) — all pure/fake-based, no network or hardware needed to run them.

Beyond the automated suite, every collector — and Phase 7's RMM plumbing — was also manually exercised against real state on a development machine: the Browser Collector against a real, running (locked) Chrome history file; the File Collector by creating/renaming/modifying/deleting a real file on a real Desktop folder mid-run; the USB/Printer collectors' WMI queries against real connected USB hardware and the real print spooler; the Hardware/Software/Security collectors against this machine's real CPU/RAM/GPU/disk, its 97 real installed applications, and its real Defender/Firewall/Secure Boot/UAC state; and the `WTSDisconnectSession` P/Invoke plumbing behind `LOCK_SESSION`, which correctly found this machine's real active console session (verified without actually triggering a disconnect, which would have killed the terminal running the test). That level of verification doesn't run in CI — treat the automated suite as the regression safety net and this as evidence the design assumptions hold on real Windows. **Not verified for real**: the auto-update service's actual stop/backup/swap/start sequence — there's no second Agent build to install and no real Windows Service set up in this environment, so that script was generated and unit tested but never executed.

## Configure

Edit `appsettings.json` or override via environment variables (double underscore separates nesting, matching .NET's default configuration binder):

```
VGON_AGENT__AGENT__APIBASEURL=https://api.yourdomain.com/api/v1
VGON_AGENT__AGENT__PROVISIONINGTOKEN=<token from the dashboard's "Generate provisioning token">
```

The provisioning token is only needed for the very first run — once the Agent registers, its DPAPI-protected refresh token takes over and the config value can be cleared. If you need to re-enroll a wiped machine, generate a fresh token in the dashboard first (the old one is single-use and already consumed).

## Run interactively (development)

```bash
dotnet run
```

## Install as a Windows Service (production)

```powershell
dotnet publish -c Release -r win-x64 --self-contained false -o C:\Program Files\VgonSecurityPlus\Agent

sc.exe create VgonSecurityPlusAgent binPath= "C:\Program Files\VgonSecurityPlus\Agent\VgonAgent.exe" start= auto
sc.exe description VgonSecurityPlusAgent "VGON Security+ endpoint monitoring agent"

# Without this, the RESTART_AGENT remote action (and a crash) just leaves the service stopped —
# Environment.Exit() only ends the process, it's the SCM's recovery actions that bring it back.
sc.exe failure VgonSecurityPlusAgent reset= 86400 actions= restart/5000/restart/5000/restart/5000

sc.exe start VgonSecurityPlusAgent
```

Run `sc.exe create` from an elevated prompt. The service runs as `LocalSystem` by default, which is why credentials are protected with DPAPI's `LocalMachine` scope rather than `CurrentUser` (there is no single interactive user session to tie it to), and why `LOCK_SESSION` uses `WTSDisconnectSession` instead of `LockWorkStation`.

## What's intentionally NOT here yet

Phase 8 (analytics/ClickHouse/scale-out) is Cloud-only — see the root [README.md](../../README.md). The collector interfaces (`ICollectorStatusRegistry`-reporting `BackgroundService`s registered in `Program.cs`) are structured so each new collector plugs in the same way the existing ones do, without touching the queue, auth, or upload code.

A real pending-critical-Windows-updates count for the Security Collector still needs the Windows Update Agent COM API (`IUpdateSearcher.Search()`) — deferred since that call is slow and network-calling, not appropriate for a background collector's regular cadence; see the Security Collector's remarks.

Also note: BitLocker/TPM/local-administrator checks returned `null` in development because the check ran unelevated — a real Windows Service running as `LocalSystem` (the production deployment target, see "Install as a Windows Service" below) has the privileges these checks need. This was verified as graceful degradation (no crash, no false "insecure" finding), not as a working BitLocker/TPM read — that needs re-verifying once actually installed as a service.

Policy Engine follow-up: `FilePolicy`, `AgentPolicy`, `SecurityPolicy`'s interval, and `ApplicationPolicy`'s process denylist all resolve correctly server-side (`PolicyResolverService`, unit tested) and `ProcessCollector`/`FileCollector`/`SecurityCollector` already read their on/off switch and (for Process/File) their specific settings from `IPolicyStore`. `PrinterCollector`/`HardwareCollector`/`SoftwareCollector` only consult policy for their on/off switch — their intervals and other settings still come straight from `AgentOptions`. Wiring the rest through is the same `_policyStore.Current.X.Y ?? _options.Y` pattern already used throughout `Collectors/`.
