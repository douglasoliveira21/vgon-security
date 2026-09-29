'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface FileEventRow {
  id: string;
  deviceId: string;
  eventType: string;
  occurredAt: string;
  data: {
    path?: string;
    name?: string;
    extension?: string;
    sizeBytes?: number;
    user?: string;
    previousPath?: string;
  };
}

const ACTION_LABELS: Record<string, string> = {
  'file.created': 'Created',
  'file.modified': 'Modified',
  'file.renamed': 'Renamed',
  'file.deleted': 'Deleted',
};

function formatSize(bytes?: number) {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const [events, setEvents] = useState<FileEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [created, modified, renamed, deleted] = await Promise.all(
        ['file.created', 'file.modified', 'file.renamed', 'file.deleted'].map((eventType) =>
          apiFetch<FileEventRow[]>(`/events?eventType=${eventType}&take=25`),
        ),
      );
      const merged = [...created, ...modified, ...renamed, ...deleted].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
      setEvents(merged);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load file activity');
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
      <h1 className="mb-1 text-lg font-semibold">File activity</h1>
      <p className="mb-6 text-sm text-slate-500">
        Metadata only (path, name, size, timestamp) from watched folders — file contents are never read.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Path</th>
              <th className="px-4 py-2 font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>Loading...</td></tr>
            )}
            {!loading && events.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>No file activity yet.</td></tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-4 py-2">{new Date(e.occurredAt).toLocaleString()}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.deviceId.slice(0, 8)}</td>
                <td className="px-4 py-2">{e.data.user ?? '—'}</td>
                <td className="px-4 py-2">{ACTION_LABELS[e.eventType] ?? e.eventType}</td>
                <td className="max-w-md truncate px-4 py-2 font-mono text-xs text-slate-500" title={e.data.path}>
                  {e.eventType === 'file.renamed' && e.data.previousPath
                    ? `${e.data.previousPath} → ${e.data.path}`
                    : e.data.path ?? '—'}
                </td>
                <td className="px-4 py-2">{formatSize(e.data.sizeBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
