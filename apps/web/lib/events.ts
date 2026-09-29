// Presentation helpers for Agent events: labels, categories and one-line summaries per event type.
// The raw `data` payload is always still available to the UI (expandable JSON) — nothing here
// changes what is stored. All user-facing text goes through the i18n dictionary.

import type { I18nValue } from '@/lib/i18n';

export interface EventLike {
  eventType: string;
  data: Record<string, unknown>;
}

interface EventMeta {
  category: string;
  icon: string;
}

const META: Record<string, EventMeta> = {
  'device.heartbeat': { category: 'Device', icon: '💓' },
  'device.registered': { category: 'Device', icon: '🆕' },
  'session.login': { category: 'Session', icon: '🔓' },
  'session.logout': { category: 'Session', icon: '🚪' },
  'session.lock': { category: 'Session', icon: '🔒' },
  'session.unlock': { category: 'Session', icon: '🔓' },
  'process.started': { category: 'Processes', icon: '▶️' },
  'process.stopped': { category: 'Processes', icon: '⏹️' },
  'application.focused': { category: 'Processes', icon: '🪟' },
  'application.closed': { category: 'Processes', icon: '❎' },
  'browser.navigation': { category: 'Browsing', icon: '🌐' },
  'file.created': { category: 'Files', icon: '📄' },
  'file.modified': { category: 'Files', icon: '✏️' },
  'file.renamed': { category: 'Files', icon: '🔁' },
  'file.deleted': { category: 'Files', icon: '🗑️' },
  'usb.connected': { category: 'USB', icon: '🔌' },
  'usb.disconnected': { category: 'USB', icon: '⏏️' },
  'printer.job': { category: 'Printing', icon: '🖨️' },
  'hardware.inventory': { category: 'Inventory', icon: '🖥️' },
  'software.inventory': { category: 'Inventory', icon: '📦' },
  'security.state': { category: 'Security', icon: '🛡️' },
};

export function eventMeta(type: string, i18n: I18nValue) {
  const meta = META[type] ?? { category: 'Other', icon: '•' };
  return { ...meta, label: i18n.tOr(`event.${type}`, type) };
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

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** One-line, human-readable description of what happened. */
export function summarize(e: EventLike, i18n: I18nValue): string {
  const { t } = i18n;
  const d = e.data ?? {};
  switch (e.eventType) {
    case 'browser.navigation':
      return [str(d.title), str(d.domain) ?? str(d.url)].filter(Boolean).join(' — ') || '—';
    case 'process.started':
    case 'process.stopped': {
      const name = str(d.processName) ?? '—';
      const extra = d.suspicious
        ? ` ⚠ ${t('events.sum.suspicious')}${str(d.suspiciousReason) ? `: ${d.suspiciousReason}` : ''}`
        : '';
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
      return `${str(d.model) ?? 'USB'}${d.capacityBytes ? ` · ${formatBytes(d.capacityBytes)}` : ''}${
        d.blocked ? ` · ${t('events.sum.blocked')}` : ''
      }`;
    case 'printer.job':
      return `${str(d.documentName) ?? '—'} → ${str(d.printerName) ?? '—'}${
        d.pages ? ` · ${t('events.sum.pages', { n: Number(d.pages) })}` : ''
      }`;
    case 'hardware.inventory':
      return (
        [
          str(d.cpu),
          d.ramTotalBytes ? t('events.sum.ram', { size: formatBytes(d.ramTotalBytes) }) : undefined,
          str(d.gpu),
        ]
          .filter(Boolean)
          .join(' · ') || '—'
      );
    case 'software.inventory': {
      const added = Array.isArray(d.added) ? d.added.length : 0;
      const removed = Array.isArray(d.removed) ? d.removed.length : 0;
      return t('events.sum.software', { added, removed });
    }
    case 'security.state': {
      const flags: string[] = [];
      if (d.defenderEnabled === false) flags.push(t('events.sum.defenderOff'));
      if (d.firewallEnabled === false) flags.push(t('events.sum.firewallOff'));
      if (d.bitlockerEnabled === false) flags.push(t('events.sum.bitlockerOff'));
      if (d.secureBootEnabled === false) flags.push(t('events.sum.secureBootOff'));
      if (d.uacEnabled === false) flags.push(t('events.sum.uacOff'));
      return flags.length ? `⚠ ${flags.join(', ')}` : t('events.sum.secOk');
    }
    default: {
      const s = JSON.stringify(d);
      return s.length > 120 ? `${s.slice(0, 117)}…` : s;
    }
  }
}

/** Labelled key/value pairs for the expanded row (only fields that are actually present). */
export function detailRows(e: EventLike, i18n: I18nValue): Array<[string, string]> {
  const { t, formatDateTime } = i18n;
  const d = e.data ?? {};
  const yesNo = (v: unknown) => (v === true ? t('common.yes') : v === false ? t('common.no') : undefined);
  const rows: Array<[string, string]> = [];
  const push = (label: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    rows.push([label, typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? t('common.yes') : t('common.no')) : String(v)]);
  };
  switch (e.eventType) {
    case 'browser.navigation':
      push(t('events.detail.title'), d.title);
      push(t('events.detail.domain'), d.domain);
      push(t('events.detail.url'), d.url);
      push(t('events.detail.browser'), d.browser);
      push(t('common.user'), d.user);
      push(t('events.detail.visitedAt'), d.visitedAt && formatDateTime(String(d.visitedAt)));
      break;
    case 'process.started':
    case 'process.stopped':
      push(t('events.detail.process'), d.processName);
      push('PID', d.pid);
      push(t('events.detail.path'), d.path);
      push(t('events.detail.parent'), d.parentProcessName);
      push(t('common.user'), d.user);
      push(t('events.detail.signed'), yesNo(d.signed));
      push('SHA-256', d.sha256);
      push(t('events.detail.exitCode'), d.exitCode);
      push(t('events.detail.suspicious'), d.suspicious ? str(d.suspiciousReason) ?? t('common.yes') : undefined);
      break;
    case 'file.created':
    case 'file.modified':
    case 'file.renamed':
    case 'file.deleted':
      push(t('events.detail.name'), d.name);
      push(t('events.detail.path'), d.path);
      push(t('events.detail.previousPath'), d.previousPath);
      push(t('events.detail.size'), d.sizeBytes != null ? formatBytes(d.sizeBytes) : undefined);
      push(t('common.user'), d.user);
      break;
    case 'usb.connected':
    case 'usb.disconnected':
      push(t('events.detail.model'), d.model);
      push(t('events.detail.manufacturer'), d.manufacturer);
      push(
        t('events.detail.vendorProduct'),
        d.vendorId || d.productId ? `${d.vendorId ?? '?'} / ${d.productId ?? '?'}` : undefined,
      );
      push(t('events.detail.serial'), d.serial);
      push(t('events.detail.capacity'), d.capacityBytes != null ? formatBytes(d.capacityBytes) : undefined);
      push(t('events.detail.policy'), typeof d.policyDecision === 'string' ? i18n.tOr(`usb.decision.${d.policyDecision}`, d.policyDecision) : undefined);
      push(t('events.detail.blocked'), yesNo(d.blocked));
      push(t('common.user'), d.user);
      break;
    case 'printer.job':
      push(t('events.detail.document'), d.documentName);
      push(t('events.detail.printer'), d.printerName);
      push(t('events.detail.pages'), d.pages);
      push(t('events.detail.size'), d.sizeBytes != null ? formatBytes(d.sizeBytes) : undefined);
      push(t('common.user'), d.user);
      break;
    default:
      for (const [k, v] of Object.entries(d)) {
        if (v !== null && typeof v !== 'object') push(k, v);
      }
  }
  return rows;
}
