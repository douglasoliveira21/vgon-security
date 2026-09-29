'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

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
  };
}

export default function BrowsingPage() {
  const [events, setEvents] = useState<BrowsingEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch<BrowsingEventRow[]>('/events?eventType=browser.navigation&take=100');
      setEvents(data);
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
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Browsing activity</h1>
      <p className="mb-6 text-sm text-slate-500">
        URLs are shown exactly as the Agent reported them — depending on each device&apos;s browser policy, that may be the full URL, the domain only, or a sanitized URL with sensitive query parameters redacted.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Browser</th>
              <th className="px-4 py-2 font-medium">Domain</th>
              <th className="px-4 py-2 font-medium">URL</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>Loading...</td></tr>
            )}
            {!loading && events.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>No browsing activity yet.</td></tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-4 py-2">{new Date(e.occurredAt).toLocaleString()}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.deviceId.slice(0, 8)}</td>
                <td className="px-4 py-2">{e.data.user ?? '—'}</td>
                <td className="px-4 py-2">{e.data.browser ?? '—'}</td>
                <td className="px-4 py-2">{e.data.domain ?? '—'}</td>
                <td className="max-w-md truncate px-4 py-2 font-mono text-xs text-slate-500" title={e.data.url}>
                  {e.data.url ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
