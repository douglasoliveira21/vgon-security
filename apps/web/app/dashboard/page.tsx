'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface Device {
  id: string;
  hostname: string | null;
  status: string;
  os: string | null;
  agentVersion: string | null;
  lastSeenAt: string | null;
}

interface ProvisioningTokenResponse {
  provisioningToken: string;
  expiresAt: string;
}

const ACTION_TYPES = [
  { value: 'REFRESH_POLICY', label: 'Refresh policy' },
  { value: 'COLLECT_INVENTORY', label: 'Collect inventory now' },
  { value: 'RESTART_AGENT', label: 'Restart Agent' },
  { value: 'LOCK_SESSION', label: 'Lock session' },
];

const STATUS_STYLES: Record<string, string> = {
  ONLINE: 'bg-green-100 text-green-700',
  STALE: 'bg-amber-100 text-amber-700',
  OFFLINE: 'bg-slate-200 text-slate-600',
  PENDING: 'bg-blue-100 text-blue-700',
  BLOCKED: 'bg-red-100 text-red-700',
  DECOMMISSIONED: 'bg-slate-200 text-slate-500',
};

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState<ProvisioningTokenResponse | null>(null);
  const [selectedAction, setSelectedAction] = useState<Record<string, string>>({});
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function loadDevices() {
    try {
      const data = await apiFetch<Device[]>('/devices');
      setDevices(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
    const interval = setInterval(loadDevices, 15_000);
    return () => clearInterval(interval);
  }, []);

  async function runAction(deviceId: string) {
    const type = selectedAction[deviceId] ?? ACTION_TYPES[0].value;
    setRunningAction(deviceId);
    setActionMessage(null);
    try {
      await apiFetch(`/devices/${deviceId}/actions`, {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      setActionMessage(`Queued "${ACTION_TYPES.find((a) => a.value === type)?.label}" — the Agent picks it up on its next poll.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to queue action');
    } finally {
      setRunningAction(null);
    }
  }

  async function generateToken() {
    try {
      const res = await apiFetch<ProvisioningTokenResponse>('/agents/provisioning-tokens', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNewToken(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create provisioning token');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Devices</h1>
        <button
          onClick={generateToken}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Generate provisioning token
        </button>
      </div>

      {newToken && (
        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm">
          <p className="mb-1 font-medium text-blue-800">Provisioning token (shown once)</p>
          <code className="block break-all rounded bg-white px-2 py-1 text-xs">{newToken.provisioningToken}</code>
          <p className="mt-1 text-xs text-blue-700">Expires at {new Date(newToken.expiresAt).toLocaleString()}</p>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {actionMessage && <p className="mb-4 text-sm text-green-700">{actionMessage}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Hostname</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">OS</th>
              <th className="px-4 py-2 font-medium">Agent version</th>
              <th className="px-4 py-2 font-medium">Last seen</th>
              <th className="px-4 py-2 font-medium">Remote action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>Loading...</td></tr>
            )}
            {!loading && devices.length === 0 && (
              <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>No devices yet. Generate a provisioning token and run the installer.</td></tr>
            )}
            {devices.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{d.hostname ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status] ?? 'bg-slate-100'}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-2">{d.os ?? '—'}</td>
                <td className="px-4 py-2">{d.agentVersion ?? '—'}</td>
                <td className="px-4 py-2">{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <select
                      value={selectedAction[d.id] ?? ACTION_TYPES[0].value}
                      onChange={(e) => setSelectedAction((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                    <button
                      onClick={() => runAction(d.id)}
                      disabled={runningAction === d.id}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                    >
                      {runningAction === d.id ? 'Queuing...' : 'Run'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
