// Presentation helpers for Agent events: friendly labels and one-line summaries per event type.
// The raw `data` payload is always still available to the UI (expandable JSON) — nothing here
// changes what is stored.

export interface EventLike {
  eventType: string;
  data: Record<string, unknown>;
}

export interface EventMeta {
  label: string;
  category: string;
  icon: string;
}

const META: Record<string, EventMeta> = {
  'device.heartbeat': { label: 'Heartbeat', category: 'Device', icon: '💓' },
  'device.registered': { label: 'Device registered', category: 'Device', icon: '🆕' },
  'session.login': { label: 'User signed in', category: 'Session', icon: '🔓' },
  'session.logout': { label: 'User signed out', category: 'Session', icon: '🚪' },
  'session.lock': { label: 'Session locked', category: 'Session', icon: '🔒' },
  'session.unlock': { label: 'Session unlocked', category: 'Session', icon: '🔓' },
  'process.started': { label: 'Process started', category: 'Processes', icon: '▶️' },
  'process.stopped': { label: 'Process stopped', category: 'Processes', icon: '⏹️' },
  'application.focused': { label: 'Application in use', category: 'Processes', icon: '🪟' },
  'application.closed': { label: 'Application closed', category: 'Processes', icon: '❎' },
  'browser.navigation': { label: 'Website visited', category: 'Browsing', icon: '🌐' },
  'file.created': { label: 'File created', category: 'Files', icon: '📄' },
  'file.modified': { label: 'File modified', category: 'Files', icon: '✏️' },
  'file.renamed': { label: 'File renamed', category: 'Files', icon: '🔁' },
  'file.deleted': { label: 'File deleted', category: 'Files', icon: '🗑️' },
  'usb.connected': { label: 'USB connected', category: 'USB', icon: '🔌' },
  'usb.disconnected': { label: 'USB disconnected', category: 'USB', icon: '⏏️' },
  'printer.job': { label: 'Print job', category: 'Printing', icon: '🖨️' },
  'hardware.inventory': { label: 'Hardware inventory', category: 'Inventory', icon: '🖥️' },
  'software.inventory': { label: 'Software changes', category: 'Inventory', icon: '📦' },
  'security.state': { label: 'Security status', category: 'Security', icon: '🛡️' },
};

export function eventMeta(type: string): EventMeta {
  return META[type] ?? { label: type, category: 'Other', icon: '•' };
}

export const EVENT_CATEGORIES = Array.from(new Set(Object.values(META).map((m) => m.category)));

export function typesInCategory(category: string): string[] {
  return Object.entries(META)
    .filter(([, m]) => m.category === category)
    .map(([type]) => type);
}

export function formatBytes(n: unknown): string {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const yesNo = (v: unknown) => (v === true ? 'yes' : v === false ? 'no' : undefined);

/** One-line, human-readable description of what happened. */
export function summarize(e: EventLike): string {
  const d = e.data ?? {};
  switch (e.eventType) {
    case 'browser.navigation':
      return [str(d.title), str(d.domain) ?? str(d.url)].filter(Boolean).join(' — ') || '—';
    case 'process.started':
    case 'process.stopped': {
      const name = str(d.processName) ?? 'process';
      const extra = d.suspicious ? ` ⚠ suspicious${str(d.suspiciousReason) ? `: ${d.suspiciousReason}` : ''}` : '';
      return `${name}${d.pid ? ` (PID ${d.pid})` : ''}${extra}`;
    }
    case 'application.focused':
    case 'application.closed':
      return [str(d.processName), str(d.windowTitle)].filter(Boolean).join(' — ') || '—';
    case 'file.created':
    case 'file.modified':
    case 'file.deleted':
      return `${str(d.name) ?? str(d.path) ?? '—'}${d.sizeBytes != null ? ` · ${formatBytes(d.sizeBytes)}` : ''}`;
    case 'file.renamed':
      return `${str(d.previousPath) ?? '?'} → ${str(d.path) ?? str(d.name) ?? '?'}`;
    case 'usb.connected':
    case 'usb.disconnected':
      return `${str(d.model) ?? 'USB device'}${d.capacityBytes ? ` · ${formatBytes(d.capacityBytes)}` : ''}${
        d.blocked ? ' · BLOCKED' : ''
      }`;
    case 'printer.job':
      return `${str(d.documentName) ?? 'document'} → ${str(d.printerName) ?? 'printer'}${d.pages ? ` · ${d.pages} pages` : ''}`;
    case 'hardware.inventory':
      return (
        [str(d.cpu), d.ramTotalBytes ? `${formatBytes(d.ramTotalBytes)} RAM` : undefined, str(d.gpu)]
          .filter(Boolean)
          .join(' · ') || '—'
      );
    case 'software.inventory': {
      const added = Array.isArray(d.added) ? d.added.length : 0;
      const removed = Array.isArray(d.removed) ? d.removed.length : 0;
      return `${added} installed, ${removed} removed`;
    }
    case 'security.state': {
      const flags: string[] = [];
      if (d.defenderEnabled === false) flags.push('Defender off');
      if (d.firewallEnabled === false) flags.push('Firewall off');
      if (d.bitlockerEnabled === false) flags.push('BitLocker off');
      if (d.secureBootEnabled === false) flags.push('Secure Boot off');
      if (d.uacEnabled === false) flags.push('UAC off');
      return flags.length ? `⚠ ${flags.join(', ')}` : 'All checked protections on';
    }
    default: {
      const s = JSON.stringify(d);
      return s.length > 120 ? `${s.slice(0, 117)}…` : s;
    }
  }
}

/** Labelled key/value pairs for the expanded row (only fields that are actually present). */
export function detailRows(e: EventLike): Array<[string, string]> {
  const d = e.data ?? {};
  const rows: Array<[string, string]> = [];
  const push = (label: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    rows.push([label, typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)]);
  };
  switch (e.eventType) {
    case 'browser.navigation':
      push('Title', d.title);
      push('Domain', d.domain);
      push('URL', d.url);
      push('Browser', d.browser);
      push('User', d.user);
      push('Visited at', d.visitedAt && new Date(String(d.visitedAt)).toLocaleString());
      break;
    case 'process.started':
    case 'process.stopped':
      push('Process', d.processName);
      push('PID', d.pid);
      push('Path', d.path);
      push('Parent', d.parentProcessName);
      push('User', d.user);
      push('Signed', yesNo(d.signed));
      push('SHA-256', d.sha256);
      push('Exit code', d.exitCode);
      push('Suspicious', d.suspicious ? `yes — ${str(d.suspiciousReason) ?? ''}` : undefined);
      break;
    case 'file.created':
    case 'file.modified':
    case 'file.renamed':
    case 'file.deleted':
      push('Name', d.name);
      push('Path', d.path);
      push('Previous path', d.previousPath);
      push('Size', d.sizeBytes != null ? formatBytes(d.sizeBytes) : undefined);
      push('User', d.user);
      break;
    case 'usb.connected':
    case 'usb.disconnected':
      push('Device', d.model);
      push('Manufacturer', d.manufacturer);
      push('Vendor / Product', d.vendorId || d.productId ? `${d.vendorId ?? '?'} / ${d.productId ?? '?'}` : undefined);
      push('Serial', d.serial);
      push('Capacity', d.capacityBytes != null ? formatBytes(d.capacityBytes) : undefined);
      push('Policy decision', d.policyDecision);
      push('Blocked', yesNo(d.blocked));
      push('User', d.user);
      break;
    case 'printer.job':
      push('Document', d.documentName);
      push('Printer', d.printerName);
      push('Pages', d.pages);
      push('Size', d.sizeBytes != null ? formatBytes(d.sizeBytes) : undefined);
      push('User', d.user);
      break;
    default:
      for (const [k, v] of Object.entries(d)) {
        if (v !== null && typeof v !== 'object') push(k, v);
      }
  }
  return rows;
}

export const SEVERITY_STYLES: Record<string, string> = {
  INFO: 'bg-slate-100 text-slate-600',
  LOW: 'bg-blue-100 text-blue-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};
