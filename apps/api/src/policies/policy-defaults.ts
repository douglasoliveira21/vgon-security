import {
  AgentPolicySettings,
  ApplicationPolicySettings,
  BrowserPolicySettings,
  BrowserUrlPolicy,
  CollectionPolicySettings,
  FilePolicySettings,
  SecurityPolicySettings,
  UsbPolicySettings,
} from '@vgon/shared';

// Mirrors the Agent's own appsettings.json defaults (agent/VgonAgent/appsettings.json) — a
// tenant with zero configured policies gets Agent behavior identical to before Phase 6.
export const DEFAULT_BROWSER_POLICY: Required<BrowserPolicySettings> = {
  urlPolicy: BrowserUrlPolicy.SANITIZED_URL,
  sensitiveParams: ['token', 'session', 'password', 'pwd', 'secret', 'key', 'auth', 'sig', 'signature', 'credential'],
  pollIntervalSeconds: 30,
};

export const DEFAULT_FILE_POLICY: Required<FilePolicySettings> = {
  watchFolders: ['Desktop', 'Documents', 'Downloads'],
  excludedExtensions: ['.tmp', '.temp', '.crdownload', '.partial', '.log', '.ds_store'],
};

export const DEFAULT_USB_POLICY: Required<UsbPolicySettings> = {
  defaultPolicy: 'MONITOR',
  allowlist: [],
};

export const DEFAULT_APPLICATION_POLICY: Required<ApplicationPolicySettings> = {
  suspiciousProcessNames: ['mimikatz.exe', 'psexec.exe', 'procdump.exe', 'pwdump.exe'],
};

export const DEFAULT_SECURITY_POLICY: Required<SecurityPolicySettings> = {
  collectorIntervalSeconds: 1800,
};

export const DEFAULT_AGENT_POLICY: Required<AgentPolicySettings> = {
  heartbeatIntervalSeconds: 60,
  eventUploadIntervalSeconds: 15,
};

export const DEFAULT_COLLECTION_POLICY: Required<CollectionPolicySettings> = {
  processCollectorEnabled: true,
  browserCollectorEnabled: true,
  fileCollectorEnabled: true,
  usbCollectorEnabled: true,
  printerCollectorEnabled: true,
  hardwareCollectorEnabled: true,
  softwareCollectorEnabled: true,
  securityCollectorEnabled: true,
};
