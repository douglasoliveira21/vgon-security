'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface UsbEventRow {
  id: string;
  deviceId: string;
  eventType: string;
  severity: string;
  occurredAt: string;
  data: {
    vendorId?: string;
    productId?: string;
    serial?: string;
    manufacturer?: string;
    model?: string;
    capacityBytes?: number;
    user?: string;
    policyDecision?: string;
    blocked?: boolean;
  };
}

const DECISION_STYLES: Record<string, string> = {
  ALLOWED: 'bg-green-100 text-green-700',
  MONITORED: 'bg-slate-100 text-slate-600',
  BLOCKED: 'bg-red-100 text-red-700',
};

function formatCapacity(bytes?: number) {
  if (!bytes) return '—';
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function UsbPage() {
  const [events, setEvents] = useState<UsbEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [connected, disconnected] = await Promise.all([
        apiFetch<UsbEventRow[]>('/events?eventType=usb.connected&take=50'),
        apiFetch<UsbEventRow[]>('/events?eventType=usb.disconnected&take=50'),
      ]);
      const merged = [...connected, ...disconnected].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
      setEvents(merged);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load USB activity');
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
      <h1 className="mb-6 text-lg font-semibold">USB devices</h1>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Event</th>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">Serial</th>
              <th className="px-4 py-2 font-medium">Capacity</th>
              <th className="px-4 py-2 font-medium">Policy</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={8}>Loading...</td></tr>
            )}
            {!loading && events.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={8}>No USB activity yet.</td></tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-4 py-2">{new Date(e.occurredAt).toLocaleString()}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.deviceId.slice(0, 8)}</td>
                <td className="px-4 py-2">{e.data.user ?? '—'}</td>
                <td className="px-4 py-2">{e.eventType === 'usb.connected' ? 'Connected' : 'Disconnected'}</td>
                <td className="px-4 py-2">{e.data.model ?? '—'}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.data.serial ?? '—'}</td>
                <td className="px-4 py-2">{formatCapacity(e.data.capacityBytes)}</td>
                <td className="px-4 py-2">
                  {e.data.policyDecision && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_STYLES[e.data.policyDecision] ?? 'bg-slate-100'}`}>
                      {e.data.policyDecision}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
