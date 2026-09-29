'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface PrinterEventRow {
  id: string;
  deviceId: string;
  occurredAt: string;
  data: {
    printerName?: string;
    documentName?: string;
    user?: string;
    pages?: number;
  };
}

export default function PrintersPage() {
  const [events, setEvents] = useState<PrinterEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch<PrinterEventRow[]>('/events?eventType=printer.job&take=100');
      setEvents(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load print jobs');
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
      <h1 className="mb-1 text-lg font-semibold">Print jobs</h1>
      <p className="mb-6 text-sm text-slate-500">Document names and page counts only — document content is never captured.</p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Printer</th>
              <th className="px-4 py-2 font-medium">Document</th>
              <th className="px-4 py-2 font-medium">Pages</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>Loading...</td></tr>
            )}
            {!loading && events.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>No print jobs yet.</td></tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-4 py-2">{new Date(e.occurredAt).toLocaleString()}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.deviceId.slice(0, 8)}</td>
                <td className="px-4 py-2">{e.data.user ?? '—'}</td>
                <td className="px-4 py-2">{e.data.printerName ?? '—'}</td>
                <td className="px-4 py-2">{e.data.documentName ?? '—'}</td>
                <td className="px-4 py-2">{e.data.pages ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
