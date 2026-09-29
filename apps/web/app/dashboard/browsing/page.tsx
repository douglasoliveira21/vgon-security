'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useDevices } from '@/lib/useDevices';
import { useClientFilter } from '@/lib/ClientFilter';
import { Icon } from '@/lib/icons';
import { Badge, EmptyRow, ErrorBanner, LoadingRow, PageHeader, Timestamp, Tone } from '@/lib/ui';

interface BrowsingEventRow {
  id: string;
  deviceId: string;
  occurredAt: string;
  data: {
    browser?: string;
    url?: string;
    domain?: string;
    title?: string;
    user?: string;
    visitedAt?: string;
  };
}

const BROWSER_TONE: Record<string, Tone> = { Chrome: 'green', Edge: 'blue', Firefox: 'orange' };

// The visit time the browser itself recorded is more accurate than when the Agent uploaded it.
const visitTime = (e: BrowsingEventRow) => e.data.visitedAt ?? e.occurredAt;
const isLink = (url?: string) => !!url && /^https?:\/\//i.test(url);

export default function BrowsingPage() {
  const { t } = useI18n();
  const { devices, nameOf } = useDevices();
  const { clientId } = useClientFilter();
  const [events, setEvents] = useState<BrowsingEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const params = new URLSearchParams({ eventType: 'browser.navigation', take: '500' });
      if (deviceId) params.set('deviceId', deviceId);
      if (clientId) params.set('clientId', clientId);
      setEvents(await apiFetch<BrowsingEventRow[]>(`/events?${params}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, clientId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? events.filter((e) =>
          `${e.data.title ?? ''} ${e.data.domain ?? ''} ${e.data.url ?? ''} ${e.data.user ?? ''}`.toLowerCase().includes(q),
        )
      : events;
    return [...rows].sort((a, b) => new Date(visitTime(b)).getTime() - new Date(visitTime(a)).getTime());
  }, [events, search]);

  const topDomains = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of visible) {
      const d = e.data.domain;
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [visible]);

  return (
    <div>
      <PageHeader
        title={t('browsing.title')}
        subtitle={t('browsing.subtitle')}
        meta={`${t('browsing.visits', { n: visible.length })} · ${t('common.refreshEvery', { seconds: 15 })}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t('browsing.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">{t('common.allDevices')}</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.hostname ?? d.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      {topDomains.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {topDomains.map(([domain, count]) => (
            <button
              key={domain}
              onClick={() => setSearch(domain)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-brand hover:text-brand"
            >
              {domain} <span className="text-slate-400">· {count}</span>
            </button>
          ))}
        </div>
      )}

      <ErrorBanner message={error} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('browsing.col.visited')}</th>
              <th>{t('browsing.col.deviceUser')}</th>
              <th>{t('browsing.col.browser')}</th>
              <th>{t('browsing.col.site')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={4} />}
            {!loading && visible.length === 0 && (
              <EmptyRow colSpan={4} icon="globe">
                {events.length === 0 ? (
                  <>
                    {t('browsing.empty')}{' '}
                    <Link href="/dashboard/policies" className="font-medium text-brand hover:underline">
                      {t('browsing.policiesLink')}
                    </Link>
                  </>
                ) : (
                  t('browsing.noMatch')
                )}
              </EmptyRow>
            )}
            {visible.map((e) => (
              <tr key={e.id} className="align-top hover:bg-slate-50">
                <td><Timestamp iso={visitTime(e)} /></td>
                <td>
                  <div className="font-medium text-slate-800">{nameOf(e.deviceId)}</div>
                  <div className="text-xs text-slate-500">{e.data.user ?? '—'}</div>
                </td>
                <td>
                  <Badge tone={BROWSER_TONE[e.data.browser ?? ''] ?? 'slate'}>{e.data.browser ?? '—'}</Badge>
                </td>
                <td className="max-w-lg">
                  {e.data.title && <div className="truncate font-medium text-slate-800">{e.data.title}</div>}
                  <div className="truncate text-xs text-slate-500">{e.data.domain ?? '—'}</div>
                  {e.data.url &&
                    (isLink(e.data.url) ? (
                      <a
                        href={e.data.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="block truncate font-mono text-xs text-brand hover:underline"
                        title={e.data.url}
                      >
                        {e.data.url}
                      </a>
                    ) : (
                      <div className="truncate font-mono text-xs text-slate-400" title={e.data.url}>{e.data.url}</div>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
