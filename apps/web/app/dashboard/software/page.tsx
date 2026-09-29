'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface SoftwareRow {
  id: string;
  deviceId: string;
  name: string;
  version: string | null;
  publisher: string | null;
  architecture: string | null;
  lastSeenAt: string;
}

export default function SoftwarePage() {
  const [items, setItems] = useState<SoftwareRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(name?: string) {
    try {
      const query = name ? `?name=${encodeURIComponent(name)}` : '';
      const data = await apiFetch<SoftwareRow[]>(`/software${query}`);
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load software inventory');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    load(search || undefined);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Software inventory</h1>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
            Search
          </button>
        </form>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium">Publisher</th>
              <th className="px-4 py-2 font-medium">Architecture</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>Loading...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>No software inventory reported yet.</td></tr>
            )}
            {items.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2">{s.name}</td>
                <td className="px-4 py-2">{s.version || '—'}</td>
                <td className="px-4 py-2">{s.publisher ?? '—'}</td>
                <td className="px-4 py-2">{s.architecture ?? '—'}</td>
                <td className="px-4 py-2 font-mono text-xs">{s.deviceId.slice(0, 8)}</td>
                <td className="whitespace-nowrap px-4 py-2">{new Date(s.lastSeenAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
