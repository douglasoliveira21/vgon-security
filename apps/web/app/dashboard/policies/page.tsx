'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface PolicyRow {
  id: string;
  scope: string;
  scopeId: string | null;
  type: string;
  settings: Record<string, unknown>;
  version: number;
  updatedAt: string;
}

const SCOPES = ['TENANT', 'SITE', 'GROUP', 'DEVICE'];
const TYPES = ['BROWSER', 'FILE', 'USB', 'APPLICATION', 'SECURITY', 'AGENT', 'COLLECTION'];

const SETTINGS_PLACEHOLDER: Record<string, string> = {
  BROWSER: '{"urlPolicy": "SANITIZED_URL"}',
  FILE: '{"watchFolders": ["Desktop", "Documents"]}',
  USB: '{"defaultPolicy": "BLOCK"}',
  APPLICATION: '{"suspiciousProcessNames": ["mimikatz.exe"]}',
  SECURITY: '{"collectorIntervalSeconds": 1800}',
  AGENT: '{"heartbeatIntervalSeconds": 60}',
  COLLECTION: '{"usbCollectorEnabled": false}',
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [scope, setScope] = useState('TENANT');
  const [scopeId, setScopeId] = useState('');
  const [type, setType] = useState('BROWSER');
  const [settingsText, setSettingsText] = useState(SETTINGS_PLACEHOLDER.BROWSER);

  async function load() {
    try {
      const data = await apiFetch<PolicyRow[]>('/policies');
      setPolicies(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load policies');
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
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(settingsText);
    } catch {
      setError('Settings must be valid JSON');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/policies', {
        method: 'PUT',
        body: JSON.stringify({ scope, scopeId: scope === 'TENANT' ? undefined : scopeId, type, settings }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save policy');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/policies/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete policy');
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Policies</h1>
      <p className="mb-6 text-sm text-slate-500">
        Tenant → Site → Group → Device. A more specific override only replaces the fields it sets — everything else falls through to the next level, and ultimately to the Agent&apos;s own defaults.
      </p>

      <form onSubmit={handleSubmit} className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 grid grid-cols-4 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Scope</label>
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Scope ID {scope === 'TENANT' && '(n/a)'}</label>
            <input
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              disabled={scope === 'TENANT'}
              placeholder={scope === 'TENANT' ? '—' : `${scope.toLowerCase()} id`}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setSettingsText(SETTINGS_PLACEHOLDER[e.target.value]); }}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save policy'}
            </button>
          </div>
        </div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Settings (JSON)</label>
        <textarea
          value={settingsText}
          onChange={(e) => setSettingsText(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs"
        />
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Scope</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Settings</th>
              <th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium">Updated</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>Loading...</td></tr>
            )}
            {!loading && policies.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>No policy overrides configured — every device uses the Agent&apos;s built-in defaults.</td></tr>
            )}
            {policies.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2">{p.scope}{p.scopeId ? ` (${p.scopeId.slice(0, 8)})` : ''}</td>
                <td className="px-4 py-2">{p.type}</td>
                <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-slate-500">{JSON.stringify(p.settings)}</td>
                <td className="px-4 py-2">{p.version}</td>
                <td className="whitespace-nowrap px-4 py-2">{new Date(p.updatedAt).toLocaleString()}</td>
                <td className="px-4 py-2">
                  <button onClick={() => handleDelete(p.id)} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
