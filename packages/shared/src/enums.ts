export enum Role {
  OWNER = 'OWNER',
  ADMINISTRATOR = 'ADMINISTRATOR',
  SECURITY_ADMIN = 'SECURITY_ADMIN',
  IT_ADMIN = 'IT_ADMIN',
  ANALYST = 'ANALYST',
  VIEWER = 'VIEWER',
}

// Granular permission keys (section 21). Enforced server-side via PermissionsGuard.
export enum Permission {
  DEVICES_READ = 'devices.read',
  DEVICES_MANAGE = 'devices.manage',
  EVENTS_READ = 'events.read',
  SECURITY_READ = 'security.read',
  SECURITY_MANAGE = 'security.manage',
  POLICIES_READ = 'policies.read',
  POLICIES_MANAGE = 'policies.manage',
  USERS_MANAGE = 'users.manage',
  REPORTS_READ = 'reports.read',
  AGENTS_MANAGE = 'agents.manage',
  AUDIT_READ = 'audit.read',
  // Periodic screenshots and live (view-only) screen sessions — kept separate from
  // DEVICES_MANAGE since it's meaningfully more sensitive than other device management actions
  // and an org may want to grant it to a narrower set of roles.
  SCREEN_VIEW = 'screen.view',
  // WIPE_DEVICE only: irreversibly erases the device. Kept separate from — and far more
  // restricted than — DEVICES_MANAGE, which covers every other (recoverable) remote action.
  DEVICES_WIPE = 'devices.wipe',
}

// Default role -> permission mapping. Kept in code (not DB) for Phase 1;
// can move to a Role/Permission join table once custom roles are needed.
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: Object.values(Permission),
  [Role.ADMINISTRATOR]: Object.values(Permission),
  [Role.SECURITY_ADMIN]: [
    Permission.DEVICES_READ,
    Permission.EVENTS_READ,
    Permission.SECURITY_READ,
    Permission.SECURITY_MANAGE,
    Permission.POLICIES_READ,
    Permission.POLICIES_MANAGE,
    Permission.REPORTS_READ,
    Permission.AUDIT_READ,
    Permission.SCREEN_VIEW,
  ],
  [Role.IT_ADMIN]: [
    Permission.DEVICES_READ,
    Permission.DEVICES_MANAGE,
    Permission.AGENTS_MANAGE,
    Permission.EVENTS_READ,
    Permission.POLICIES_READ,
    Permission.REPORTS_READ,
    Permission.SCREEN_VIEW,
  ],
  [Role.ANALYST]: [
    Permission.DEVICES_READ,
    Permission.EVENTS_READ,
    Permission.SECURITY_READ,
    Permission.REPORTS_READ,
  ],
  [Role.VIEWER]: [Permission.DEVICES_READ, Permission.REPORTS_READ],
};

export enum DeviceStatus {
  PENDING = 'PENDING', // provisioning token issued, agent not yet registered
  ONLINE = 'ONLINE',
  STALE = 'STALE',
  OFFLINE = 'OFFLINE',
  BLOCKED = 'BLOCKED',
  DECOMMISSIONED = 'DECOMMISSIONED',
}

export enum AgentTokenStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

export enum UserActionTokenType {
  INVITE = 'INVITE',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

export enum EventSeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// Event type namespace, extended in later phases (process.*, browser.*, file.*, usb.* ...)
export enum EventType {
  DEVICE_HEARTBEAT = 'device.heartbeat',
  DEVICE_REGISTERED = 'device.registered',
  SESSION_LOGIN = 'session.login',
  SESSION_LOGOUT = 'session.logout',
  SESSION_LOCK = 'session.lock',
  SESSION_UNLOCK = 'session.unlock',

  // Phase 2 — Process / Application collectors (section 7)
  PROCESS_STARTED = 'process.started',
  PROCESS_STOPPED = 'process.stopped',
  APPLICATION_FOCUSED = 'application.focused',
  APPLICATION_CLOSED = 'application.closed',

  // Phase 3 — Browser collector (section 8)
  BROWSER_NAVIGATION = 'browser.navigation',

  // Phase 4 — File / USB / Printer collectors (sections 9, 10, 11)
  FILE_CREATED = 'file.created',
  FILE_MODIFIED = 'file.modified',
  FILE_RENAMED = 'file.renamed',
  FILE_DELETED = 'file.deleted',
  USB_CONNECTED = 'usb.connected',
  USB_DISCONNECTED = 'usb.disconnected',
  PRINT_JOB = 'printer.job',

  // Phase 5 — Hardware / Software / Security inventory (sections 12, 13)
  HARDWARE_INVENTORY = 'hardware.inventory',
  SOFTWARE_INVENTORY = 'software.inventory',
  SECURITY_STATE = 'security.state',
}

export enum FindingStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}

// Security Finding codes the Agent's security.state payload can trigger (section 13). Kept as
// a fixed, known set for Phase 5 — a configurable rule engine is Phase 6's Policy Engine.
export enum FindingCode {
  DEFENDER_DISABLED = 'DEFENDER_DISABLED',
  FIREWALL_DISABLED = 'FIREWALL_DISABLED',
  BITLOCKER_DISABLED = 'BITLOCKER_DISABLED',
  SECURE_BOOT_DISABLED = 'SECURE_BOOT_DISABLED',
  TPM_MISSING = 'TPM_MISSING',
  UAC_DISABLED = 'UAC_DISABLED',
  WINDOWS_UPDATE_PENDING_CRITICAL = 'WINDOWS_UPDATE_PENDING_CRITICAL',
  MULTIPLE_LOCAL_ADMINS = 'MULTIPLE_LOCAL_ADMINS',
}

// section 26/Phase 7 (RMM) — a fixed, known set of safe actions. Never arbitrary command
// execution: this is a monitoring/management agent, not a remote-shell backdoor.
export enum RemoteActionType {
  REFRESH_POLICY = 'REFRESH_POLICY',
  COLLECT_INVENTORY = 'COLLECT_INVENTORY',
  RESTART_AGENT = 'RESTART_AGENT',
  // A full OS reboot (shutdown.exe /r), not just the Agent process — see RESTART_AGENT for that.
  RESTART_DEVICE = 'RESTART_DEVICE',
  LOCK_SESSION = 'LOCK_SESSION',
  // View-only live screen session (section "RMM extensions"): the Agent streams JPEG frames of
  // the active desktop while a visible on-screen banner is shown for the duration. No input
  // (mouse/keyboard) channel exists anywhere in this pipeline — the Agent never receives or
  // could receive input events for this action, only ever sends frames out.
  START_SCREEN_VIEW = 'START_SCREEN_VIEW',
  // On-demand version of ScreenshotCollector's periodic, silent capture (no on-screen notice —
  // unlike START_SCREEN_VIEW above) — wakes it immediately instead of waiting for its next
  // interval, the same ICollectionTrigger pattern COLLECT_INVENTORY already uses.
  CAPTURE_SCREENSHOT = 'CAPTURE_SCREENSHOT',
  // Irreversible: triggers Windows' own full factory-reset flow (systemreset.exe -factoryreset),
  // erasing all data on the device. Gated by Permission.DEVICES_WIPE, not DEVICES_MANAGE.
  WIPE_DEVICE = 'WIPE_DEVICE',
}

export enum RemoteActionStatus {
  PENDING = 'PENDING',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// section 24 — Agent auto-update release channels.
export enum ReleaseChannel {
  STABLE = 'STABLE',
  BETA = 'BETA',
}

// section 10: effective decision applied to a detected USB device.
export enum UsbPolicyDecision {
  ALLOWED = 'ALLOWED',
  BLOCKED = 'BLOCKED',
  MONITORED = 'MONITORED',
}

// How much of a visited URL the Agent is allowed to report (section 8). Enforced Agent-side —
// the Cloud never sees the un-sanitized URL for a device configured with DOMAIN_ONLY/SANITIZED_URL.
export enum BrowserUrlPolicy {
  FULL_URL = 'FULL_URL',
  DOMAIN_ONLY = 'DOMAIN_ONLY',
  SANITIZED_URL = 'SANITIZED_URL',
}
