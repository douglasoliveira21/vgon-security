'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useClientFilter } from '@/lib/ClientFilter';
import { useDevices } from '@/lib/useDevices';
import { Icon } from '@/lib/icons';
import { SeverityBadge } from '@/lib/ui';

interface Finding {
  id: string;
  deviceId: string;
  title: string;
  severity: string;
  detectedAt: string;
}

const POLL_MS = 30_000;
const PREVIEW_LIMIT = 6;

export function NotificationBell() {
  const { t, relativeTime } = useI18n();
  const { clientId } = useClientFilter();
  const { nameOf } = useDevices();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      const params = new URLSearchParams({ status: 'OPEN' });
      if (clientId) params.set('clientId', clientId);
      setFindings(await apiFetch<Finding[]>(`/security/findings?${params}`));
    } catch {
      /* the bell is a convenience surface — a failed poll just leaves the last known count */
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function resolve(id: string) {
    setResolving(id);
    try {
      await apiFetch(`/security/findings/${id}/resolve`, { method: 'POST' });
      await load();
    } catch {
      /* leave it in the list — the user can retry, or resolve it from the full Security Center */
    } finally {
      setResolving(null);
    }
  }

  const count = findings.length;
  const hasCritical = findings.some((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={t('notifications.title')}
      >
        <Icon name="bell" className="h-5 w-5" />
        {count > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${
              hasCritical ? 'bg-red-600' : 'bg-amber-500'
            }`}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-800">{t('notifications.title')}</span>
            {count > 0 && <span className="text-xs text-slate-400">{t('notifications.openCount', { n: count })}</span>}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {count === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">{t('notifications.empty')}</p>}
            {findings.slice(0, PREVIEW_LIMIT).map((f) => (
              <div key={f.id} className="flex items-start gap-3 border-b border-slate-50 px-4 py-3 last:border-0">
                <SeverityBadge severity={f.severity} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{f.title}</div>
                  <div className="text-xs text-slate-400">
                    {nameOf(f.deviceId)} · {relativeTime(f.detectedAt)}
                  </div>
                </div>
                <button
                  onClick={() => resolve(f.id)}
                  disabled={resolving === f.id}
                  className="shrink-0 text-xs font-medium text-brand hover:underline disabled:opacity-50"
                >
                  {t('security.resolve')}
                </button>
              </div>
            ))}
          </div>

          <Link
            href="/dashboard/security"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand hover:bg-slate-50"
          >
            {t('notifications.viewAll')}
          </Link>
        </div>
      )}
    </div>
  );
}
