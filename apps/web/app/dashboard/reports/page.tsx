'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface Overview {
  totalDevices: number;
  deviceStatusCounts: Record<string, number>;
  openFindingsBySeverity: Record<string, number>;
  eventsLast24h: number;
  eventsLast7d: number;
  activeSoftwarePackages: number;
}

interface TimeseriesPoint {
  date: string;
  count: number;
}

interface CountRow {
  eventType?: string;
  domain?: string;
  count: number;
}

const STATUS_ORDER = ['ONLINE', 'STALE', 'OFFLINE', 'PENDING', 'BLOCKED', 'DECOMMISSIONED'];
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.max((count / max) * 100, 2) : 0;
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between text-xs text-slate-600">
        <span className="truncate">{label}</span>
        <span className="font-medium">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [topEventTypes, setTopEventTypes] = useState<CountRow[]>([]);
  const [topDomains, setTopDomains] = useState<CountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [o, ts, types, domains] = await Promise.all([
          apiFetch<Overview>('/reports/overview'),
          apiFetch<TimeseriesPoint[]>('/reports/events-timeseries?days=14'),
          apiFetch<CountRow[]>('/reports/top-event-types?days=7'),
          apiFetch<CountRow[]>('/reports/top-domains?days=7'),
        ]);
        setOverview(o);
        setTimeseries(ts);
        setTopEventTypes(types);
        setTopDomains(domains);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="text-sm text-slate-400">Loading...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!overview) return null;

  const maxTimeseries = Math.max(...timeseries.map((p) => p.count), 1);
  const maxEventTypeCount = Math.max(...topEventTypes.map((r) => r.count), 1);
  const maxDomainCount = Math.max(...topDomains.map((r) => r.count), 1);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Reports</h1>

      <div className="mb-6 grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Devices</div>
          <div className="text-2xl font-semibold">{overview.totalDevices}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Events (24h)</div>
          <div className="text-2xl font-semibold">{overview.eventsLast24h}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Events (7d)</div>
          <div className="text-2xl font-semibold">{overview.eventsLast7d}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Active software</div>
          <div className="text-2xl font-semibold">{overview.activeSoftwarePackages}</div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Devices by status</h2>
          {STATUS_ORDER.filter((s) => overview.deviceStatusCounts[s]).map((s) => (
            <Bar key={s} label={s} count={overview.deviceStatusCounts[s] ?? 0} max={overview.totalDevices} />
          ))}
          {Object.keys(overview.deviceStatusCounts).length === 0 && (
            <p className="text-xs text-slate-400">No devices yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Open findings by severity</h2>
          {SEVERITY_ORDER.filter((s) => overview.openFindingsBySeverity[s]).map((s) => (
            <Bar key={s} label={s} count={overview.openFindingsBySeverity[s] ?? 0} max={overview.totalDevices || 1} />
          ))}
          {Object.keys(overview.openFindingsBySeverity).length === 0 && (
            <p className="text-xs text-slate-400">No open findings.</p>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Events per day (last 14 days)</h2>
        <div className="flex h-32 items-end gap-1">
          {timeseries.map((p) => (
            <div key={p.date} className="group relative flex-1">
              <div
                className="rounded-t bg-brand"
                style={{ height: `${Math.max((p.count / maxTimeseries) * 100, 2)}%` }}
              />
              <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100">
                {p.date}: {p.count}
              </div>
            </div>
          ))}
          {timeseries.length === 0 && <p className="text-xs text-slate-400">No events yet.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Top event types (7d)</h2>
          {topEventTypes.map((r) => (
            <Bar key={r.eventType} label={r.eventType ?? '—'} count={r.count} max={maxEventTypeCount} />
          ))}
          {topEventTypes.length === 0 && <p className="text-xs text-slate-400">No events yet.</p>}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Top browsing domains (7d)</h2>
          {topDomains.map((r) => (
            <Bar key={r.domain} label={r.domain ?? '—'} count={r.count} max={maxDomainCount} />
          ))}
          {topDomains.length === 0 && <p className="text-xs text-slate-400">No browsing activity yet.</p>}
        </div>
      </div>
    </div>
  );
}
