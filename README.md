# VGON Security+

Multi-tenant SaaS for monitoring, inventory, audit and security management of Windows endpoints.

Two components:
- **VGON Security+ Agent** (`agent/VgonAgent`) — .NET 10 Worker Service / Windows Service, installed on customer machines. Phase 2: device identity, local SQLite event queue, Process Collector.
- **VGON Security+ Cloud** — this repository's `apps/`: NestJS API + Next.js dashboard + PostgreSQL/Redis.

## Architecture

```
Agent  --HTTPS-->  API Gateway (NestJS)  -->  Auth  -->  Event Ingestion  -->  Queue (BullMQ/Redis)  -->  Event Workers  -->  PostgreSQL
                                                                                                                              |
                                                                                                                        Dashboard (Next.js)
```

The Agent never talks to PostgreSQL directly. Everything goes through the API, which enqueues events onto Redis for a worker process to persist — an ingestion request returns as soon as the batch is queued, so a slow or momentarily unavailable database never blocks the Agent's HTTP call.

Multi-tenancy: every business entity (`User`, `Device`, `AgentCredential`, `ProvisioningToken`, `AuditLog`, ...) carries a `tenantId`. Authorization is always derived server-side from the authenticated identity (JWT `sub`/`tenantId` claim, re-validated against the DB on every request) — **never** from a client-supplied `tenantId` in the body/query/params.

## Repository layout

```
apps/
  api/            NestJS API (auth, tenants, users, devices, agent provisioning, events, audit)
    prisma/       schema.prisma, migrations, seed.ts
    src/
  web/            Next.js dashboard
agent/
  VgonAgent/      .NET 10 Worker Service (the actual Windows endpoint Agent)
packages/
  shared/         Types shared between api and web (event envelope, enums, RBAC permission map)
docker-compose.dev.yml
.env.example
```

## Phase 1 — what's implemented

- Monorepo (npm workspaces): `apps/api`, `apps/web`, `packages/shared`
- PostgreSQL via Prisma (Tenant, Site, Group, User, Device, ProvisioningToken, AgentCredential, AuditLog)
- Web authentication: tenant self-registration + login (argon2 password hashing, short-lived JWT)
- RBAC: 6 roles (Owner, Administrator, SecurityAdmin, ITAdmin, Analyst, Viewer) mapped to granular permissions, enforced by `PermissionsGuard`
- Agent provisioning flow (section 4 of the spec):
  1. Admin calls `POST /agents/provisioning-tokens` (requires `agents.manage`) → gets a single-use, short-lived opaque token (only its SHA-256 hash is stored)
  2. Installer/Agent calls `POST /agents/register` with that token → server creates the `Device` + a unique `AgentCredential` for it, invalidates the provisioning token, and returns a device-scoped access token (JWT, 10 min TTL) + refresh token (opaque, 30-day TTL, rotated on every use)
  3. Agent calls `POST /agents/token/refresh` to rotate its refresh token before expiry (old token becomes invalid immediately — replay of a stale refresh token is rejected and audited)
  4. Agent calls `POST /agents/heartbeat` (Bearer device access token) — updates `lastSeenAt`; the dashboard derives ONLINE/STALE/OFFLINE from heartbeat recency rather than a value the Agent could self-report
  5. Admin can call `POST /devices/:id/revoke` to immediately block a device and revoke its credential — takes effect on the *next* API call because the agent-JWT strategy re-checks credential status per request, not just at token expiry
- Audit log for all administrative actions (login, user create/activate, provisioning token issuance, device registration/revocation, token refresh/rejection)
- Basic dashboard (Next.js + Tailwind): login, device list with live status, "generate provisioning token" action

## Phase 2 — what's implemented

- **Event ingestion pipeline**: `POST /events` (Agent JWT) validates a batch (max 200), then enqueues each envelope onto a BullMQ/Redis queue instead of writing to Postgres inline. A separate `EventsProcessor` worker consumes the queue and persists to the `Event` table; a Postgres unique constraint on `eventId` makes redelivery idempotent (a retried batch after a dropped response never double-counts).
- **`tenantId`/`deviceId` are never trusted from the event body** — `EventsController` derives both from the authenticated device (`AgentAuthGuard`) before enqueueing, even though the wire format only needs `eventId`/`eventType`/`severity`/`data`/etc.
- **Timeline**: `GET /events` (web JWT + `events.read`), tenant-scoped, filterable by `deviceId`/`eventType`/`from`/`to`. Minimal dashboard page at `/dashboard/events`.
- **The Agent itself** (`agent/VgonAgent`, .NET 10 Worker Service — this didn't exist before Phase 2):
  - Registers with a provisioning token on first run, stores its refresh token DPAPI-encrypted, auto-refreshes its access token, sends heartbeats — implements the client side of the Phase 1 provisioning contract
  - **Process Collector** (`IProcessCollector`): polls the process table (default every 5s), emits `process.started`/`process.stopped`, flags a configurable denylist as suspicious (`Agent:SuspiciousProcessNames`)
  - **Local SQLite event queue**: collectors enqueue locally first; a separate uploader drains it in severity-then-age order and batches to `/events` with exponential backoff + jitter on failure, so the Agent keeps collecting even when offline or when the Cloud is unreachable
  - Each collector and background service catches its own exceptions — one failing collector cannot take down the Worker Service

## Phase 3 — what's implemented

- **Browser Collector** (`IBrowserHistoryReader`, section 8), supporting Chrome, Edge and Firefox: instead of a browser extension (avoids per-browser store approval and enterprise-policy deployment), it periodically reads each browser's own history database — `History` (Chrome/Edge, shared schema, WebKit epoch) and `places.sqlite` (Firefox, different schema/epoch). The Agent runs as `LocalSystem`, so it enumerates real `C:\Users\*` profile folders rather than relying on per-user environment variables.
- **Never reads a locked file in place**: the source database is copied to a temp file first (browsers keep it open, often WAL-mode), so the collector can never interfere with the browser's own access to it — verified against a real, running Chrome instance during development.
- **Per-profile cursor**: tracks the last visit timestamp seen per database in a small JSON file, so a service restart doesn't resend history — and a newly enrolled device starts from "now", not the user's entire browsing history, to avoid flooding the queue on first install.
- **Configurable URL policy** (`Agent:BrowserUrlPolicy`): `FULL_URL`, `DOMAIN_ONLY`, or `SANITIZED_URL` (default) — sanitization redacts the *value* of any query parameter matching a configurable denylist (`Agent:SensitiveUrlParams`: token, session, password, key, auth, ...) and always strips the URL fragment (common OAuth-implicit-flow token leak point), regardless of policy. Sanitization happens Agent-side, before the URL ever reaches the local queue — the Cloud stores exactly what it's given, it does not re-sanitize.
- Never reads page content — only the url/title/timestamp metadata the browser itself already recorded.
- **Browsing dashboard**: `/dashboard/browsing`, reusing the existing `GET /events?eventType=browser.navigation` timeline endpoint rather than a duplicate backend route.

## Phase 4 — what's implemented

- **File Collector** (section 9): event-driven via `FileSystemWatcher` (not polling) across a configurable, narrow set of per-user folders — Desktop/Documents/Downloads by default, `Agent:FileWatchFolders` — enumerated the same LocalSystem-safe way as the Browser Collector. Emits `file.created`/`file.modified`/`file.renamed`/`file.deleted` with path/name/extension/size/user metadata only, never file content. `Changed` event bursts from a single save are debounced (`Agent:FileChangeDebounceSeconds`); noisy extensions (`.tmp`, `.log`, ...) and folders (`node_modules`, `.git`, ...) are excluded by default.
- **USB Collector** (section 10): polls WMI (`Win32_PnPEntity` + `Win32_DiskDrive` for capacity) every `Agent:UsbCollectorPollIntervalSeconds`, diffs the connected-device set. Effective policy (`Agent:UsbDefaultPolicy`: `ALLOW`/`BLOCK`/`MONITOR`, default `MONITOR`) plus a vendor/product/serial allowlist (`Agent:UsbAllowlist`) decide the reported `policyDecision`; under `BLOCK`, the Agent attempts to actually disable the device via WMI (`Win32_PnPEntity.Disable`) and reports whether it succeeded. Defaulting to `MONITOR` is deliberate — the Agent never disables a user's hardware unless an admin explicitly opts into `BLOCK`.
- **Printer Collector** (section 11): polls `Win32_PrintJob` every `Agent:PrinterCollectorPollIntervalSeconds`, reports a job the first time it's seen (document name, owner, page count when available) — document content is never read, since WMI never exposes it in the first place.
- **Dashboards**: `/dashboard/files`, `/dashboard/usb`, `/dashboard/printers` — all thin pages over the existing `GET /events` timeline endpoint, no new backend routes.
- All three collectors were manually verified against this machine's real filesystem, USB devices and print spooler during development (not just unit tests) — see the Agent README for what was checked.

## Phase 5 — what's implemented

- **Hardware Collector** (section 12): WMI-based (CPU, RAM, disks, GPU, motherboard, BIOS, serial), on a long interval (`Agent:HardwareCollectorIntervalSeconds`, default 6h) since hardware essentially never changes at runtime. Sends its full snapshot each run — there's no meaningful "diff" of a CPU model.
- **Software Collector** (section 12): reads the standard Add/Remove Programs registry locations (not WMI's `Win32_Product`, which can trigger MSI repairs just by being queried), diffs against a snapshot persisted across service restarts, and only sends what changed (`Agent:SoftwareCollectorIntervalSeconds`, default 1h) — the very first run's "added" list is the one-time full initial inventory.
- **Security Collector** (section 13): reports Defender/Firewall/BitLocker/Secure Boot/TPM/UAC state and local administrator accounts (registry + WMI + `System.DirectoryServices.AccountManagement`), every `Agent:SecurityCollectorIntervalSeconds` (default 30m). Every field is independently best-effort — a check that fails or needs elevation the Agent doesn't have is reported as `null` ("unknown"), never guessed, so the rule evaluator below never turns "couldn't check" into a false-positive finding. A real Windows-Update pending-count check needs the (slow, network-calling) Windows Update Agent COM API — deliberately deferred, see the Agent README.
- **`SecurityEvaluatorService`** (Cloud, `apps/api/src/inventory`): a small fixed rule set (section 13) turns `security.state` events into `SecurityFinding` rows — one per `(device, code)`, reopened if the condition recurs, auto-resolved once it clears. Pure rule logic (`evaluateSecurityFindings`) is unit tested independently of the Prisma orchestration around it.
- **Inventory endpoints**: `GET /hardware`, `GET /software` (filterable by device/name), `GET /security/findings` (filterable by device/status/severity) + `POST /security/findings/:id/resolve` for a manual override — all tenant-scoped, all audit-logged where they mutate state.
- **Dashboards**: `/dashboard/hardware`, `/dashboard/software`, `/dashboard/security` (Security Center — severity counts + an Open/Resolved toggle, per section 19).
- All three Agent collectors were run against this machine's real hardware, real installed software (97 real applications correctly enumerated) and real security configuration during development — see the Agent README.

## Phase 6 — what's implemented

- **Policy model** (Cloud, `apps/api/src/policies`, section 16): `Policy` rows keyed by `(tenant, scope, scopeId, type)` where scope is `TENANT`/`SITE`/`GROUP`/`DEVICE` and type is `BROWSER`/`FILE`/`USB`/`APPLICATION`/`SECURITY`/`AGENT`/`COLLECTION`. `PolicyResolverService` merges the rows that apply to a given device — most-specific-wins **per field**, not per whole object, so a Group policy can tighten just one setting while everything else still falls through from the Tenant default. A tenant with zero configured policies gets Agent behavior byte-for-byte identical to before Phase 6 (the resolver's built-in defaults mirror the Agent's own `appsettings.json` defaults).
- **`GET /agents/policy`** (Agent JWT): returns the fully-resolved policy for the calling device. **`PUT /policies`** / **`GET /policies`** / **`DELETE /policies/:id`** (web JWT, `policies.read`/`policies.manage`) for admin CRUD, audit-logged.
- **The Agent actually applies it, not just fetches it**: `PolicyRefreshService` polls `GET /agents/policy` (`Agent:PolicyRefreshIntervalSeconds`, default 5m) and caches the result to disk (`%ProgramData%\VgonSecurityPlus\policy-cache.json`) — a Cloud outage leaves the Agent applying the last policy it successfully received (section 16: "continuar aplicando a última política válida"), not falling back to local defaults. Every collector's per-cycle enable check now reads `CollectionPolicy` first, falling back to its local config only if no server policy exists yet — toggling a collector off from the dashboard takes effect within one poll cycle, no Agent restart. The Browser Collector's URL policy/sensitive-params and the USB Collector's default-policy/allowlist are wired the same way, as the clearest demonstration that policy changes actually change Agent behavior, not just get stored.
- **`/dashboard/policies`**: create/update/delete overrides at any scope, with a JSON settings editor (the settings shape genuinely varies per policy type, so a fully bespoke form per type wasn't worth building yet — see Next phases).

## Phase 7 — what's implemented

- **RMM: controlled remote actions** (`apps/api/src/rmm`, section 26): a *fixed enum* of four safe actions — `REFRESH_POLICY`, `COLLECT_INVENTORY`, `RESTART_AGENT`, `LOCK_SESSION` — never arbitrary command execution. Admin queues one via `POST /devices/:id/actions` (from the Devices table's new "Remote action" column); the Agent polls `GET /agents/actions/pending` (which atomically marks them `ACKNOWLEDGED` so a concurrent poll can't double-execute), runs it, and reports back via `POST /agents/actions/:id/complete`.
- **The Agent actually executes them**: `REFRESH_POLICY` re-fetches and applies the policy immediately; `COLLECT_INVENTORY` wakes the Hardware/Software/Security collectors via a new `ICollectionTrigger` (they were sleeping on a multi-hour `Task.Delay` — the trigger races that delay against an immediate wakeup, so this doesn't need to wait for the next scheduled cycle); `LOCK_SESSION` uses `WTSDisconnectSession` rather than `LockWorkStation()`, because the Agent runs as `LocalSystem` in Session 0 (session-isolated since Vista) and `LockWorkStation` would lock the wrong session; `RESTART_AGENT` exits the process and relies on Windows Service Recovery actions (configured at install time) to bring it back — see the Agent README.
- **Agent auto-update** (`apps/api/src/rmm`, section 24): `AgentRelease` rows (version, channel, download URL, **required SHA-256**) published via `POST /agent-releases`; the Agent's `GET /agents/updates/latest?channel=` returns the newest release on its configured channel (`Agent:UpdateChannel`, default `STABLE`). The Agent compares versions with real semver logic (not string comparison — "1.10.0" needs to correctly beat "1.9.0"), downloads the artifact, and **verifies the SHA-256 before doing anything else** — a mismatch aborts the update and logs a security event; it is never installed. On a match, it generates a PowerShell script (stop service → back up current install → apply the new files → start service → verify it's actually running → roll back to the backup on any failure) and launches it as a detached process, since a running `.exe` can't overwrite its own file — the swap has to happen after the process exits.
- **`/dashboard/releases`**: publish a release (version/channel/URL/SHA-256/notes/mandatory flag) and see the catalog.
- **What wasn't run for real in this dev session**: the actual service-stop-and-swap was implemented and its script-generation logic is unit tested (stop-before-copy ordering, backup-before-apply ordering, rollback-on-failure path), but never executed end-to-end against a real installed Windows Service — there's no second Agent build to install in this environment, and actually stopping/replacing a real service is exactly the kind of consequential action worth being explicit about rather than quietly assuming it works. The `WTSDisconnectSession` P/Invoke plumbing *was* verified for real — it correctly found this machine's actual active console session — without triggering the disruptive disconnect itself.

## Phase 8 — what's implemented

- **Reports/analytics** (`apps/api/src/reports`, sections 18/22): `GET /reports/overview` (device status breakdown, open findings by severity, 24h/7d event volume, active software count — all in one round trip), `GET /reports/events-timeseries` (daily event counts), `GET /reports/top-event-types`, `GET /reports/top-domains`. The two "top" queries aggregate a JSON column (`eventType`, and `data->>'domain'` for browsing) — Prisma's query builder can't `GROUP BY` a JSON path or a truncated timestamp, so those two are raw SQL, still fully parameterized via tagged templates (no string-concatenated user input). `/dashboard/reports` renders all four as plain CSS bar charts / a day-by-day bar strip — no charting library pulled in for four simple aggregates.
- **Horizontal scaling, for real, not just documented**: the BullMQ event worker (`EventsProcessor`) now has its own entrypoint (`apps/api/src/main-worker.ts` / `worker.module.ts`) that starts **no HTTP server at all** — just the DI container and the queue consumer. `docker-compose.dev.yml` and [EASYPANEL.md](EASYPANEL.md) both deploy it as a separate `worker` service/App from the same image, so its replica count scales independently of the API's. This closes a gap called out in every phase since Phase 2's README note ("run a second instance dedicated to worker processing").
- **Distributed rate limiting**: swapped the default in-memory `ThrottlerStorage` for a Redis-backed one (`apps/api/src/config/redis-throttler-storage.ts`). With N horizontally-scaled API replicas, in-memory counters are per-process — each replica enforces the configured limit independently, so the *effective* limit (and brute-force protection on `/auth/login`, `/agents/register`, etc.) silently becomes N× what was configured. Backing it with Redis (already a hard dependency for the queue) fixes this for any replica count.
- **Two real bugs this phase's own verification caught**, both only surfacing because a *second* application entrypoint (the worker) was actually run instead of just type-checked:
  1. `apps/api/tsconfig.json` had no `rootDir`/`include`, so TypeScript inferred the common root from *all* input files — including `prisma/seed.ts`, which sits outside `src/`. That silently nested the build output under `dist/src/main.js` instead of `dist/main.js`, which would have made `apps/api/Dockerfile`'s `CMD ["node", "dist/main.js"]` fail in a real deployment. Never caught before because earlier phases checked `nest build`'s exit code, not its actual output layout. Fixed by scoping `tsconfig.json` to `src/`.
  2. `InventoryModule` (`SecurityController`) depends on `AuditService`, which resolved fine in the main app only because `AuditModule` is `@Global()` *within that application context* — a separate `NestFactory.createApplicationContext(WorkerModule)` call never imported `AuditModule` at all, so DI resolution failed the moment `main-worker.js` was actually run. Fixed by having `InventoryModule` import `AuditModule` explicitly instead of relying on global scope as an implicit cross-module contract. Running `node dist/main-worker.js` against no real Postgres afterward confirmed DI now resolves cleanly and fails only at the expected point (an actual DB connection attempt).
- **ClickHouse: deliberately not added.** The architecture was already prepared for it (Agent → API Gateway → Queue → Event Workers → PostgreSQL, from Phase 1's README diagram — Postgres was always meant to be swappable/augmentable at the ingestion sink, not baked into the Agent or API contract), and the spec itself says "quando necessário" (when needed). At this project's actual data volume, Postgres with the composite indexes already on `Event` (`[tenantId, deviceId, occurredAt]`, `[tenantId, eventType, occurredAt]`) comfortably serves both the OLTP timeline queries and the Phase 8 analytical aggregates — there's no real workload here that Postgres can't handle, and standing up a second datastore with no data volume to justify it would be pure speculative infrastructure. The concrete trigger for revisiting this: `Event` row count or `/reports/*` query latency actually becoming a problem — at that point, `EventsProcessor` (already isolated in its own worker process, see above) is the natural place to add a ClickHouse write path alongside (or instead of) the Postgres one, since it's the one place every event already flows through.

## Running locally

1. Copy env files:
   ```bash
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   ```
   Replace the JWT secrets with your own random values (`openssl rand -base64 48`) — never use the dev defaults outside local development.

2. Start Postgres + Redis:
   ```bash
   docker compose -f docker-compose.dev.yml up -d postgres redis
   ```

3. Install dependencies and run migrations:
   ```bash
   npm install
   npm run prisma:migrate
   npm run prisma:seed
   ```
   Seed creates tenant `acme-demo` with:
   - `owner@acme-demo.test` / `ChangeMe123!` (role OWNER)
   - `analyst@acme-demo.test` / `ChangeMe123!` (role ANALYST)

4. Run the API and the dashboard:
   ```bash
   npm run dev:api   # http://localhost:4000/api/v1
   npm run dev:web   # http://localhost:3000
   ```
   The API process also runs its own event-queue worker, so this alone is a complete setup. To also run the standalone worker (Phase 8 — the process you'd scale independently in production, see [EASYPANEL.md](EASYPANEL.md)):
   ```bash
   npm run --workspace apps/api start:worker:dev
   ```

5. Log in at `http://localhost:3000` with the owner credentials above, then click **Generate provisioning token**. Either run the real Agent (`agent/VgonAgent`, Windows only — see [its README](agent/VgonAgent/README.md)) with that token, or exercise the same flow with curl:
   ```bash
   curl -X POST http://localhost:4000/api/v1/agents/register \
     -H "Content-Type: application/json" \
     -d '{"provisioningToken":"<token>","hostname":"TEST-PC01","agentVersion":"0.1.0","os":"Windows 11 Pro"}'

   curl -X POST http://localhost:4000/api/v1/agents/heartbeat \
     -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
     -d '{"agentVersion":"0.1.0","os":"Windows 11 Pro"}'

   curl -X POST http://localhost:4000/api/v1/events \
     -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
     -d '{"events":[{"eventId":"<uuid>","agentVersion":"0.1.0","timestamp":"2026-01-01T00:00:00Z","eventType":"process.started","severity":"INFO","schemaVersion":1,"data":{"pid":1234,"processName":"notepad.exe"}}]}'
   ```
   Then check `http://localhost:3000/dashboard/events`.

Everything can also run via `docker compose -f docker-compose.dev.yml up --build` (this now also starts the BullMQ worker inside the same API process — see the note on scaling it separately in [Next phases](#next-phases)).

## Deploying (EasyPanel)

The API and the dashboard are built and deployed as two separate services from independent Dockerfiles (`apps/api/Dockerfile`, `apps/web/Dockerfile`) — see [EASYPANEL.md](EASYPANEL.md) for the full step-by-step (Postgres service, API app, web app, CORS wiring, and the `NEXT_PUBLIC_API_URL` build-time gotcha).

## API surface (Phase 1)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register-tenant` | public, rate-limited | creates Tenant + first OWNER user |
| POST | `/auth/login` | public, rate-limited | returns 15-minute JWT |
| POST | `/auth/me` | web JWT | returns current identity |
| GET/POST/PATCH | `/users` | web JWT + `users.manage` | tenant-scoped user management |
| GET | `/devices`, `/devices/:id` | web JWT + `devices.read` | live status derived from heartbeat recency |
| POST | `/devices/:id/revoke` | web JWT + `devices.manage` | blocks device, revokes credential |
| POST | `/agents/provisioning-tokens` | web JWT + `agents.manage` | single-use, short-lived |
| POST | `/agents/register` | public (token-gated), rate-limited | exchanges provisioning token for device identity |
| POST | `/agents/token/refresh` | public (refresh-token-gated), rate-limited | rotates the Agent's refresh token |
| POST | `/agents/heartbeat` | Agent JWT | updates device liveness |
| GET | `/agents/policy` | Agent JWT | fully-resolved effective policy for the calling device |
| POST | `/events` | Agent JWT | ingests a batch (max 200) of events; enqueued to BullMQ, idempotent on `eventId` |
| GET | `/events` | web JWT + `events.read` | tenant-scoped timeline, filterable by `deviceId`/`eventType`/`from`/`to` |
| GET | `/hardware` | web JWT + `devices.read` | latest hardware snapshot, filterable by `deviceId` |
| GET | `/software` | web JWT + `devices.read` | current installed-software list, filterable by `deviceId`/`name` |
| GET | `/security/findings` | web JWT + `security.read` | filterable by `deviceId`/`status`/`severity` |
| POST | `/security/findings/:id/resolve` | web JWT + `security.manage` | manual override; audit-logged |
| GET | `/policies` | web JWT + `policies.read` | tenant's policy overrides, filterable by `scope`/`type` |
| PUT | `/policies` | web JWT + `policies.manage` | upsert by `(scope, scopeId, type)`; audit-logged |
| DELETE | `/policies/:id` | web JWT + `policies.manage` | removes an override; falls back to the next-less-specific level |
| POST | `/devices/:id/actions` | web JWT + `devices.manage` | queues a remote action (`REFRESH_POLICY`/`COLLECT_INVENTORY`/`RESTART_AGENT`/`LOCK_SESSION`); audit-logged |
| GET | `/devices/:id/actions` | web JWT + `devices.read` | action history for a device |
| GET | `/agents/actions/pending` | Agent JWT | this device's pending actions; marks them `ACKNOWLEDGED` |
| POST | `/agents/actions/:id/complete` | Agent JWT | reports an action's outcome |
| POST | `/agent-releases` | web JWT + `agents.manage` | publishes a new Agent release; audit-logged |
| GET | `/agent-releases` | web JWT + `agents.manage` | release catalog |
| GET | `/agents/updates/latest` | Agent JWT | newest release for `?channel=STABLE\|BETA` |
| GET | `/reports/overview` | web JWT + `reports.read` | device status/finding-severity breakdown, event volume, active software count |
| GET | `/reports/events-timeseries` | web JWT + `reports.read` | daily event counts, `?days=` (default 7, max 90) |
| GET | `/reports/top-event-types` | web JWT + `reports.read` | most common event types in the window |
| GET | `/reports/top-domains` | web JWT + `reports.read` | most-visited domains from `browser.navigation` events |
| GET | `/audit` | web JWT + `audit.read` | tenant-scoped audit trail |
| GET | `/health` | public | liveness/readiness probe (checks DB connectivity) — used as the EasyPanel health check path |

## Tests

```bash
npm run test
```

## Project status

All 8 phases from the original spec are implemented: tenancy/auth/agent-identity (1), event ingestion (2), browser monitoring (3), file/USB/printer (4), hardware/software/security inventory (5), the policy engine (6), RMM + agent auto-update (7), and reports + horizontal scaling (8). What that does and doesn't mean in practice:

- **Every phase has real, machine-checked verification** — TypeScript/Nest build + Jest (41 tests) on the Cloud side, `dotnet build`/`dotnet test` (93 tests) on the Agent side — plus, for the Agent specifically, manual runs against this development machine's actual filesystem, USB hardware, print spooler, WMI/registry security state, and 97 real installed applications (see the Agent README for exactly what was checked).
- **Known, documented gaps rather than silently-cut corners** — each phase section above and the Agent README call out specifically what's stubbed, deferred, or only partially wired (e.g. Windows Update pending-count detection, some `Policy` settings not yet consulted by every collector, the auto-update swap script never executed end-to-end). Search this file and the Agent README for "not implemented", "deferred", or "wasn't run" to find all of them in one pass.
- **No live end-to-end run against a real Postgres/Redis** happened in this environment (no Docker available) — every verification claim above is either a unit/integration test, a `dotnet build`/`next build`/`tsc` pass, or a manual check against real OS state on this specific machine. Before production use, run through [README.md#running-locally](#running-locally) once for real with Docker Compose to confirm the full Agent → Cloud → Dashboard loop.

Next real steps, in likely priority order: run the full Docker Compose stack end-to-end at least once; install the Agent as an actual Windows Service on a test machine and exercise a real policy push, remote action, and auto-update; then work through the "not fully wired" list above as needed.

Note on Phase 6's Policy Engine: only `CollectionPolicy` (per-collector enable/disable), the Browser Collector's URL policy/sensitive-params, and the USB Collector's default-policy/allowlist are actually wired into collector behavior. `FilePolicy`'s watch-folders/excluded-extensions and `AgentPolicy`'s heartbeat/upload intervals resolve correctly server-side (and are unit tested) but the remaining collectors (File, Printer, Hardware, Software, Security) only consult the policy for their on/off switch, not their other settings — those still read `AgentOptions` directly. Wiring the rest through follows the exact same `_policyStore.Current.X.Y ?? _options.Y` pattern already used in `BrowserCollector`/`UsbCollector`/`FileCollector`; it just wasn't all done in one pass. The `/dashboard/policies` UI is also intentionally minimal (a JSON settings textarea, not a bespoke form per policy type) — functional, not polished.

Note on Phase 2's BullMQ worker: `EventsProcessor` currently runs inside the same API process for simplicity. Under real load, run a second instance of the API image with a distinct start command (or split it into its own Nest application) dedicated to `BullModule`/worker processing, so a burst of events can't starve HTTP request handling — the architecture diagram above already treats "Event Workers" as a separate box for this reason.
