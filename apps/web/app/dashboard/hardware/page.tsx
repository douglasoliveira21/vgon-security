'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface HardwareRow {
  id: string;
  hostname: string | null;
  lastInventoryAt: string | null;
  hardware: {
    cpu?: string;
    cpuCores?: number;
    ramTotalBytes?: number;
    gpu?: string;
    motherboard?: string;
    biosVersion?: string;
    serialNumber?: string;
  } | null;
}

function formatBytes(bytes?: number) {
  if (!bytes) return '—';
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function HardwarePage() {
  const [devices, setDevices] = useState<HardwareRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch<HardwareRow[]>('/hardware');
      setDevices(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load hardware inventory');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Hardware inventory</h1>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">CPU</th>
              <th className="px-4 py-2 font-medium">RAM</th>
              <th className="px-4 py-2 font-medium">GPU</th>
              <th className="px-4 py-2 font-medium">Motherboard</th>
              <th className="px-4 py-2 font-medium">Last inventory</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>Loading...</td></tr>
            )}
            {!loading && devices.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>No hardware inventory reported yet.</td></tr>
            )}
            {devices.map((d) => (
              <tr key={d.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2">{d.hostname ?? '—'}</td>
                <td className="px-4 py-2">
                  {d.hardware?.cpu ?? '—'}
                  {d.hardware?.cpuCores ? ` (${d.hardware.cpuCores} cores)` : ''}
                </td>
                <td className="px-4 py-2">{formatBytes(d.hardware?.ramTotalBytes)}</td>
                <td className="px-4 py-2">{d.hardware?.gpu ?? '—'}</td>
                <td className="px-4 py-2">{d.hardware?.motherboard ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-2">
                  {d.lastInventoryAt ? new Date(d.lastInventoryAt).toLocaleString() : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
