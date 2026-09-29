'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface Release {
  id: string;
  version: string;
  channel: string;
  downloadUrl: string;
  sha256: string;
  releaseNotes: string | null;
  mandatory: boolean;
  publishedAt: string;
}

export default function ReleasesPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [version, setVersion] = useState('');
  const [channel, setChannel] = useState('STABLE');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [sha256, setSha256] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [mandatory, setMandatory] = useState(false);

  async function load() {
    try {
      const data = await apiFetch<Release[]>('/agent-releases');
      setReleases(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load releases');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/agent-releases', {
        method: 'POST',
        body: JSON.stringify({ version, channel, downloadUrl, sha256: sha256.toLowerCase(), releaseNotes: releaseNotes || undefined, mandatory }),
      });
      setVersion('');
      setDownloadUrl('');
      setSha256('');
      setReleaseNotes('');
      setMandatory(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to publish release');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Agent releases</h1>
      <p className="mb-6 text-sm text-slate-500">
        Enrolled Agents check for updates against the latest release on their configured channel and verify the SHA-256 checksum before installing — a mismatch aborts the update.
      </p>

      <form onSubmit={handleSubmit} className="mb-8 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Version (semver)</label>
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.0" required
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Channel</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="STABLE">STABLE</option>
            <option value="BETA">BETA</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Download URL</label>
          <input value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} placeholder="https://releases.example.com/VgonAgent-1.4.0.zip" required
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">SHA-256</label>
          <input value={sha256} onChange={(e) => setSha256(e.target.value)} placeholder="64-character hex digest" required
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs" />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Release notes</label>
          <textarea value={releaseNotes} onChange={(e) => setReleaseNotes(e.target.value)} rows={2}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
          Mandatory update
        </label>
        <div className="flex items-end justify-end">
          <button type="submit" disabled={submitting} className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {submitting ? 'Publishing...' : 'Publish release'}
          </button>
        </div>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium">Channel</th>
              <th className="px-4 py-2 font-medium">SHA-256</th>
              <th className="px-4 py-2 font-medium">Mandatory</th>
              <th className="px-4 py-2 font-medium">Published</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>Loading...</td></tr>
            )}
            {!loading && releases.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>No releases published yet.</td></tr>
            )}
            {releases.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2 font-medium">{r.version}</td>
                <td className="px-4 py-2">{r.channel}</td>
                <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-slate-500">{r.sha256}</td>
                <td className="px-4 py-2">{r.mandatory ? 'Yes' : '—'}</td>
                <td className="whitespace-nowrap px-4 py-2">{new Date(r.publishedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
