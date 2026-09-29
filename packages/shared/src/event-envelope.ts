import { EventSeverity, EventType, UsbPolicyDecision } from './enums';

/**
 * Standardized envelope for every event the Agent sends to the Cloud (section 5).
 * `eventId` must be a client-generated UUID so the backend can dedupe on retry
 * (Agent → HTTPS → API Gateway → Queue can redeliver the same event).
 */
export interface EventEnvelope<TData = Record<string, unknown>> {
  eventId: string;
  tenantId: string;
  deviceId: string;
  userId?: string | null;
  agentVersion: string;
  timestamp: string; // ISO-8601, set by the Agent
  eventType: EventType | string;
  severity: EventSeverity;
  schemaVersion: number;
  data: TData;
}

// Phase 2 payloads (section 7) — process lifecycle and foreground-application usage.
export interface ProcessEventData {
  pid: number;
  processName: string;
  path?: string;
  parentPid?: number;
  parentProcessName?: string;
  user?: string;
  sha256?: string;
  signed?: boolean;
  startedAt?: string;
  stoppedAt?: string;
  exitCode?: number;
  suspicious?: boolean;
  suspiciousReason?: string;
}

export interface ApplicationEventData {
  processName: string;
  windowTitle?: string;
  durationSeconds?: number;
}

// Phase 3 payload (section 8). `url` is already policy-filtered by the Agent before it's ever
// sent — the Cloud stores and displays exactly what it received, it does not re-sanitize.
export interface BrowserEventData {
  browser: 'Chrome' | 'Edge' | 'Firefox' | string;
  url: string;
  domain: string;
  title?: string;
  user?: string;
  visitedAt: string;
}

// Phase 4 payloads (sections 9, 10, 11) — metadata only in every case; none of these ever
// carry file/document content.
export interface FileEventData {
  path: string;
  name: string;
  extension?: string;
  sizeBytes?: number;
  user?: string;
  previousPath?: string; // set on file.renamed
}

export interface UsbEventData {
  vendorId?: string;
  productId?: string;
  serial?: string;
  manufacturer?: string;
  model: string;
  capacityBytes?: number;
  user?: string;
  policyDecision: UsbPolicyDecision;
  blocked: boolean; // whether the Agent actually attempted (and succeeded at) disabling the device
}

export interface PrinterEventData {
  printerName: string;
  documentName?: string;
  user?: string;
  pages?: number;
  sizeBytes?: number;
}

// Phase 5 payloads (sections 12, 13).

export interface HardwareInventoryData {
  cpu?: string;
  cpuCores?: number;
  ramTotalBytes?: number;
  disks?: Array<{ model: string; sizeBytes?: number; serial?: string }>;
  gpu?: string;
  motherboard?: string;
  biosVersion?: string;
  serialNumber?: string;
}

export interface SoftwareItem {
  name: string;
  version?: string;
  publisher?: string;
  architecture?: string;
  installedAt?: string;
}

// Incremental by design (section 12: "evitar enviar o inventário completo em todos os
// heartbeats") — the Agent diffs against its own last snapshot and sends only the delta.
export interface SoftwareInventoryData {
  added: SoftwareItem[];
  removed: SoftwareItem[];
}

export interface SecurityStateData {
  windowsVersion?: string;
  windowsBuild?: string;
  defenderEnabled?: boolean;
  firewallEnabled?: boolean;
  bitlockerEnabled?: boolean;
  secureBootEnabled?: boolean;
  tpmPresent?: boolean;
  tpmVersion?: string;
  uacEnabled?: boolean;
  windowsUpdatePendingCritical?: number;
  localAdministrators?: string[];
}

export interface HeartbeatPayload {
  deviceId: string;
  agentVersion: string;
  os: string;
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  diskUsagePercent?: number;
  collectorStatus?: Record<string, 'RUNNING' | 'STOPPED' | 'ERROR'>;
  policyVersion?: string;
  timestamp: string;
}
