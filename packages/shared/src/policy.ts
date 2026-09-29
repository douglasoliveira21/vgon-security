import { BrowserUrlPolicy } from './enums';

// section 16: Tenant -> Site -> Group -> Device. Every field in every *Settings interface is
// optional because a policy row at any level may only override a subset of fields — the
// unresolved ones fall through to the next-less-specific level, and ultimately to the Agent's
// own local defaults if nothing was ever configured server-side.

export enum PolicyScope {
  TENANT = 'TENANT',
  SITE = 'SITE',
  GROUP = 'GROUP',
  DEVICE = 'DEVICE',
}

export enum PolicyType {
  BROWSER = 'BROWSER',
  FILE = 'FILE',
  USB = 'USB',
  APPLICATION = 'APPLICATION',
  SECURITY = 'SECURITY',
  AGENT = 'AGENT',
  COLLECTION = 'COLLECTION',
}

export interface BrowserPolicySettings {
  urlPolicy?: BrowserUrlPolicy;
  sensitiveParams?: string[];
  pollIntervalSeconds?: number;
}

export interface FilePolicySettings {
  watchFolders?: string[];
  excludedExtensions?: string[];
}

export interface UsbAllowlistEntrySettings {
  vendorId?: string;
  productId?: string;
  serial?: string;
}

export interface UsbPolicySettings {
  defaultPolicy?: 'ALLOW' | 'BLOCK' | 'MONITOR';
  allowlist?: UsbAllowlistEntrySettings[];
}

export interface ApplicationPolicySettings {
  suspiciousProcessNames?: string[];
}

export interface SecurityPolicySettings {
  collectorIntervalSeconds?: number;
}

export interface AgentPolicySettings {
  heartbeatIntervalSeconds?: number;
  eventUploadIntervalSeconds?: number;
}

// The master per-collector on/off switch (section 16's "CollectionPolicy").
export interface CollectionPolicySettings {
  processCollectorEnabled?: boolean;
  browserCollectorEnabled?: boolean;
  fileCollectorEnabled?: boolean;
  usbCollectorEnabled?: boolean;
  printerCollectorEnabled?: boolean;
  hardwareCollectorEnabled?: boolean;
  softwareCollectorEnabled?: boolean;
  securityCollectorEnabled?: boolean;
  // Periodic, silent screenshot capture (distinct from the on-demand, banner-shown live screen
  // view, which is gated by the screen.view permission rather than a policy toggle).
  screenshotCollectorEnabled?: boolean;
}

// What GET /agents/policy returns: the fully-resolved policy for one specific device.
export interface EffectivePolicy {
  version: number;
  browser: BrowserPolicySettings;
  file: FilePolicySettings;
  usb: UsbPolicySettings;
  application: ApplicationPolicySettings;
  security: SecurityPolicySettings;
  agent: AgentPolicySettings;
  collection: CollectionPolicySettings;
}
