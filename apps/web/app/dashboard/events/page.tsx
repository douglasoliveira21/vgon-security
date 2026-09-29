'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface EventRow {
  id: string;
  deviceId: string;
  eventType: string;
  severity: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

const SEVERITY_STYLES: Record<string, string> = {
  INFO: 'bg-slate-100 text-slate-600',
  LOW: 'bg-blue-100 text-blue-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch<EventRow[]>('/events?take=100');
      setEvents(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Event timeline</h1>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>Loading...</td></tr>
            )}
            {!loading && events.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>No events yet.</td></tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-4 py-2">{new Date(e.occurredAt).toLocaleString()}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.deviceId.slice(0, 8)}</td>
                <td className="px-4 py-2">{e.eventType}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[e.severity] ?? 'bg-slate-100'}`}>
                    {e.severity}
                  </span>
                </td>
                <td className="max-w-md truncate px-4 py-2 font-mono text-xs text-slate-500">
                  {JSON.stringify(e.data)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
