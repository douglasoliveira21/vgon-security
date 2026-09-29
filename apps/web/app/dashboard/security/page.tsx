'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface Finding {
  id: string;
  deviceId: string;
  code: string;
  title: string;
  description?: string;
  severity: string;
  status: string;
  detectedAt: string;
  resolvedAt?: string;
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700 border-red-200',
  HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  LOW: 'bg-blue-100 text-blue-700 border-blue-200',
  INFO: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function SecurityCenterPage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  async function load() {
    try {
      const data = await apiFetch<Finding[]>(`/security/findings?status=${statusFilter}`);
      setFindings(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load security findings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function resolve(id: string) {
    setResolving(id);
    try {
      await apiFetch(`/security/findings/${id}/resolve`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to resolve finding');
    } finally {
      setResolving(null);
    }
  }

  const counts = SEVERITY_ORDER.reduce<Record<string, number>>((acc, sev) => {
    acc[sev] = findings.filter((f) => f.severity === sev).length;
    return acc;
  }, {});

  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Security Center</h1>
        <div className="inline-flex rounded-md border border-slate-300 text-sm">
          <button
            onClick={() => setStatusFilter('OPEN')}
            className={`px-3 py-1.5 ${statusFilter === 'OPEN' ? 'bg-brand text-white' : 'bg-white text-slate-600'} rounded-l-md`}
          >
            Open
          </button>
          <button
            onClick={() => setStatusFilter('RESOLVED')}
            className={`px-3 py-1.5 ${statusFilter === 'RESOLVED' ? 'bg-brand text-white' : 'bg-white text-slate-600'} rounded-r-md`}
          >
            Resolved
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-5 gap-3">
        {SEVERITY_ORDER.map((sev) => (
          <div key={sev} className={`rounded-lg border px-4 py-3 ${SEVERITY_STYLES[sev]}`}>
            <div className="text-xs font-medium uppercase tracking-wide">{sev}</div>
            <div className="text-2xl font-semibold">{counts[sev]}</div>
          </div>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Finding</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">Detected</th>
              {statusFilter === 'OPEN' && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>Loading...</td></tr>
            )}
            {!loading && sorted.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>No {statusFilter.toLowerCase()} findings.</td></tr>
            )}
            {sorted.map((f) => (
              <tr key={f.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[f.severity]}`}>
                    {f.severity}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium">{f.title}</div>
                  {f.description && <div className="text-xs text-slate-500">{f.description}</div>}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{f.deviceId.slice(0, 8)}</td>
                <td className="whitespace-nowrap px-4 py-2">{new Date(f.detectedAt).toLocaleString()}</td>
                {statusFilter === 'OPEN' && (
                  <td className="px-4 py-2">
                    <button
                      onClick={() => resolve(f.id)}
                      disabled={resolving === f.id}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                    >
                      {resolving === f.id ? 'Resolving...' : 'Resolve'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
