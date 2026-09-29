'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useDevices } from '@/lib/useDevices';
import { relativeTime } from '@/lib/events';

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

const BROWSER_STYLES: Record<string, string> = {
  Chrome: 'bg-green-100 text-green-700',
  Edge: 'bg-blue-100 text-blue-700',
  Firefox: 'bg-orange-100 text-orange-700',
};

// The visit time the browser itself recorded is more accurate than when the Agent uploaded it.
const visitTime = (e: BrowsingEventRow) => e.data.visitedAt ?? e.occurredAt;

function isLink(url?: string) {
  return !!url && /^https?:\/\//i.test(url);
}

export default function BrowsingPage() {
  const { devices, nameOf } = useDevices();
  const [events, setEvents] = useState<BrowsingEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const params = new URLSearchParams({ eventType: 'browser.navigation', take: '500' });
      if (deviceId) params.set('deviceId', deviceId);
      const data = await apiFetch<BrowsingEventRow[]>(`/events?${params}`);
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load browsing activity');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

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

  const inputCls = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Browsing activity</h1>
        <span className="text-xs text-slate-400">{visible.length} visits · refreshes every 15 s</span>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Sites visited in Chrome, Edge and Firefox on enrolled devices. URLs are shown exactly as the Agent reported them:
        depending on the device&apos;s browser policy that is the full URL, the domain only, or a sanitized URL with sensitive
        query parameters removed.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} w-64`}
          placeholder="Search site, title or user..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={inputCls} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">All devices</option>
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
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-brand hover:text-brand"
            >
              {domain} <span className="text-slate-400">· {count}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Visited</th>
              <th className="px-4 py-2 font-medium">Device / user</th>
              <th className="px-4 py-2 font-medium">Browser</th>
              <th className="px-4 py-2 font-medium">Site</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={4}>Loading...</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={4}>
                  {events.length === 0 ? (
                    <>
                      No browsing activity yet. The Agent only records pages opened <strong>after</strong> it was installed
                      (it does not import old history), and checks the browsers every 30 seconds — open a site on an
                      enrolled device and refresh in a minute. Also check that the Browser collector is enabled in{' '}
                      <a href="/dashboard/policies" className="text-brand hover:underline">Policies</a>.
                    </>
                  ) : (
                    'No visits match your search.'
                  )}
                </td>
              </tr>
            )}
            {visible.map((e) => {
              const when = visitTime(e);
              return (
                <tr key={e.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-4 py-2">
                    <div>{new Date(when).toLocaleString()}</div>
                    <div className="text-xs text-slate-400">{relativeTime(when)}</div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{nameOf(e.deviceId)}</div>
                    <div className="text-xs text-slate-500">{e.data.user ?? '—'}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BROWSER_STYLES[e.data.browser ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                      {e.data.browser ?? '—'}
                    </span>
                  </td>
                  <td className="max-w-lg px-4 py-2">
                    {e.data.title && <div className="truncate font-medium">{e.data.title}</div>}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
