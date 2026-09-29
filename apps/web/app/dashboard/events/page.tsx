'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useDevices } from '@/lib/useDevices';
import {
  detailRows,
  EVENT_CATEGORIES,
  eventMeta,
  relativeTime,
  SEVERITY_STYLES,
  summarize,
  typesInCategory,
} from '@/lib/events';

interface EventRow {
  id: string;
  deviceId: string;
  eventType: string;
  severity: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function EventsPage() {
  const { devices, nameOf } = useDevices();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const [category, setCategory] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [severity, setSeverity] = useState('');
  const [search, setSearch] = useState('');
  const [hideHeartbeats, setHideHeartbeats] = useState(true);

  async function load() {
    try {
      const params = new URLSearchParams({ take: '300' });
      if (deviceId) params.set('deviceId', deviceId);
      const data = await apiFetch<EventRow[]>(`/events?${params}`);
      setEvents(data);
      setError(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const visible = useMemo(() => {
    const types = category ? typesInCategory(category) : null;
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (hideHeartbeats && e.eventType === 'device.heartbeat') return false;
      if (types && !types.includes(e.eventType)) return false;
      if (severity && e.severity !== severity) return false;
      if (q) {
        const hay = `${eventMeta(e.eventType).label} ${summarize(e)} ${nameOf(e.deviceId)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, category, severity, search, hideHeartbeats, nameOf]);

  const inputCls = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Event timeline</h1>
        <span className="text-xs text-slate-400">
          {visible.length} of {events.length} events · refreshes every 10 s
        </span>
      </div>
      <p className="mb-4 text-sm text-slate-500">Activity reported by the Agents, newest first. Click a row for details.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} w-56`}
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {EVENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select className={inputCls} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">All devices</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.hostname ?? d.id.slice(0, 8)}</option>
          ))}
        </select>
        <select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Any severity</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={hideHeartbeats} onChange={(e) => setHideHeartbeats(e.target.checked)} />
          Hide heartbeats
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">Event</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">What happened</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>Loading...</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={5}>
                  {events.length === 0
                    ? 'No events yet. Once an Agent is enrolled and running, its activity shows up here.'
                    : 'No events match the current filters.'}
                </td>
              </tr>
            )}
            {visible.map((e) => {
              const meta = eventMeta(e.eventType);
              const open = expanded === e.id;
              const rows = open ? detailRows(e) : [];
              return (
                <Fragment key={e.id}>
                  <tr
                    className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50"
                    onClick={() => setExpanded(open ? null : e.id)}
                  >
                    <td className="whitespace-nowrap px-4 py-2">
                      <div>{new Date(e.occurredAt).toLocaleTimeString()}</div>
                      <div className="text-xs text-slate-400" title={new Date(e.occurredAt).toLocaleString()}>
                        {relativeTime(e.occurredAt)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{nameOf(e.deviceId)}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <span className="mr-1.5">{meta.icon}</span>
                      {meta.label}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[e.severity] ?? 'bg-slate-100'}`}>
                        {e.severity}
                      </span>
                    </td>
                    <td className="max-w-md truncate px-4 py-2 text-slate-600">{summarize(e)}</td>
                  </tr>
                  {open && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={5} className="px-4 py-3">
                        <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1 text-sm">
                          <dt className="text-slate-500">Event type</dt>
                          <dd className="font-mono text-xs">{e.eventType}</dd>
                          <dt className="text-slate-500">Time</dt>
                          <dd>{new Date(e.occurredAt).toLocaleString()}</dd>
                          <dt className="text-slate-500">Device</dt>
                          <dd>{nameOf(e.deviceId)} <span className="font-mono text-xs text-slate-400">{e.deviceId}</span></dd>
                          {rows.map(([label, value]) => (
                            <Fragment key={label}>
                              <dt className="text-slate-500">{label}</dt>
                              <dd className="break-all">{value}</dd>
                            </Fragment>
                          ))}
                        </dl>
                        <button
                          className="mt-3 text-xs text-brand hover:underline"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setShowRaw(!showRaw);
                          }}
                        >
                          {showRaw ? 'Hide raw data' : 'Show raw data'}
                        </button>
                        {showRaw && (
                          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-white p-3 text-xs text-slate-600">
                            {JSON.stringify(e.data, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
