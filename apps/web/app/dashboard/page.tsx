'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { Icon } from '@/lib/icons';
import { EmptyRow, ErrorBanner, LoadingRow, PageHeader, StatCard, StatusBadge, SuccessBanner } from '@/lib/ui';
import { LiveScreenViewer } from '@/lib/LiveScreenViewer';
import { WipeDeviceModal } from '@/lib/WipeDeviceModal';
import { useClientFilter } from '@/lib/ClientFilter';

interface Device {
  id: string;
  hostname: string | null;
  status: string;
  os: string | null;
  agentVersion: string | null;
  loggedInUser: string | null;
  lastSeenAt: string | null;
  clientId: string | null;
  client: { id: string; name: string } | null;
}

interface ProvisioningTokenResponse {
  provisioningToken: string;
  expiresAt: string;
}

const ACTION_TYPES = ['REFRESH_POLICY', 'COLLECT_INVENTORY', 'CAPTURE_SCREENSHOT', 'RESTART_AGENT', 'RESTART_DEVICE', 'LOCK_SESSION'] as const;

// Actions that disrupt whoever is using the device right now get an extra confirmation click —
// unlike the others here, which are silent or (for LOCK_SESSION) merely require re-authentication.
const DISRUPTIVE_ACTIONS: ReadonlySet<string> = new Set(['RESTART_DEVICE']);

export default function DashboardPage() {
  const { t, formatDateTime, relativeTime } = useI18n();
  const { clientId: clientFilter, clients } = useClientFilter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState<ProvisioningTokenResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedAction, setSelectedAction] = useState<Record<string, string>>({});
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [viewingScreen, setViewingScreen] = useState<{ id: string; name: string } | null>(null);
  const [wipingDevice, setWipingDevice] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');

  async function loadDevices() {
    try {
      const params = new URLSearchParams();
      if (clientFilter) params.set('clientId', clientFilter);
      setDevices(await apiFetch<Device[]>(`/devices?${params}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
    const interval = setInterval(loadDevices, 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientFilter]);

  async function assignClient(deviceId: string, newClientId: string) {
    setError(null);
    try {
      await apiFetch(`/devices/${deviceId}`, { method: 'PATCH', body: JSON.stringify({ clientId: newClientId }) });
      await loadDevices();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    }
  }

  async function removeDevice(device: Device) {
    if (!window.confirm(t('devices.removeConfirm', { name: device.hostname ?? device.id.slice(0, 8) }))) return;
    setError(null);
    try {
      await apiFetch(`/devices/${device.id}`, { method: 'DELETE' });
      await loadDevices();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    }
  }

  const visibleDevices = search.trim()
    ? devices.filter((d) => {
        const q = search.trim().toLowerCase();
        return (d.hostname ?? '').toLowerCase().includes(q) || (d.loggedInUser ?? '').toLowerCase().includes(q);
      })
    : devices;

  async function runAction(deviceId: string, hostname: string | null) {
    const type = selectedAction[deviceId] ?? ACTION_TYPES[0];
    if (DISRUPTIVE_ACTIONS.has(type)) {
      const name = hostname ?? deviceId.slice(0, 8);
      if (!window.confirm(t('devices.action.confirmDisruptive', { action: t(`devices.action.${type}` as TranslationKey), device: name }))) {
        return;
      }
    }
    setRunningAction(deviceId);
    setActionMessage(null);
    try {
      await apiFetch(`/devices/${deviceId}/actions`, { method: 'POST', body: JSON.stringify({ type }) });
      setActionMessage(t('devices.queued', { action: t(`devices.action.${type}` as TranslationKey) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('devices.error.action'));
    } finally {
      setRunningAction(null);
    }
  }

  async function generateToken() {
    setCopied(false);
    try {
      const res = await apiFetch<ProvisioningTokenResponse>('/agents/provisioning-tokens', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNewToken(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('devices.error.token'));
    }
  }

  async function copyToken() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken.provisioningToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the token is still selectable */
    }
  }

  const online = visibleDevices.filter((d) => d.status === 'ONLINE').length;
  const attention = visibleDevices.filter((d) => ['STALE', 'OFFLINE', 'BLOCKED'].includes(d.status)).length;

  return (
    <div>
      <PageHeader
        title={t('devices.title')}
        subtitle={t('devices.subtitle')}
        actions={
          <button onClick={generateToken} className="btn-primary">
            <Icon name="plus" className="h-4 w-4" />
            {t('devices.token.button')}
          </button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t('devices.total')} value={visibleDevices.length} icon="devices" />
        <StatCard label={t('devices.online')} value={online} icon="activity" tone="green" />
        <StatCard label={t('devices.attention')} value={attention} icon="alert" tone={attention ? 'amber' : 'slate'} />
      </div>

      <div className="mb-4 relative w-full sm:w-72">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder={t('devices.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {newToken && (
        <div className="card mb-6 border-blue-200 bg-blue-50/60 p-5">
          <p className="mb-2 text-sm font-semibold text-blue-900">{t('devices.token.title')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-blue-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
              {newToken.provisioningToken}
            </code>
            <button onClick={copyToken} className="btn-secondary">
              <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
              {copied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
          <p className="mt-2 text-xs text-blue-800">{t('devices.token.how')}</p>
          <p className="mt-1 text-xs text-blue-700">{t('devices.token.expires', { date: formatDateTime(newToken.expiresAt) })}</p>
        </div>
      )}

      <ErrorBanner message={error} />
      <SuccessBanner message={actionMessage} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('devices.col.hostname')}</th>
              <th>{t('devices.col.loggedInUser')}</th>
              <th>{t('common.status')}</th>
              <th>{t('clients.title')}</th>
              <th>{t('devices.col.os')}</th>
              <th>{t('devices.col.agent')}</th>
              <th>{t('devices.col.lastSeen')}</th>
              <th>{t('devices.col.action')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={8} />}
            {!loading && visibleDevices.length === 0 && (
              <EmptyRow colSpan={8} icon="devices">{t('devices.empty')}</EmptyRow>
            )}
            {visibleDevices.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="font-medium text-slate-900">{d.hostname ?? '—'}</td>
                <td className="text-slate-600">
                  {d.loggedInUser ? d.loggedInUser : <span className="text-slate-400">{t('devices.noUserLoggedIn')}</span>}
                </td>
                <td><StatusBadge status={d.status} /></td>
                <td>
                  <select
                    value={d.clientId ?? ''}
                    onChange={(e) => assignClient(d.id, e.target.value)}
                    className="input w-auto py-1.5 text-xs"
                  >
                    <option value="">{t('org.selectClient')}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-slate-600">{d.os ?? '—'}</td>
                <td className="font-mono text-xs text-slate-600">{d.agentVersion ?? '—'}</td>
                <td>
                  {d.lastSeenAt ? (
                    <div title={formatDateTime(d.lastSeenAt)}>{relativeTime(d.lastSeenAt)}</div>
                  ) : (
                    <span className="text-slate-400">{t('common.never')}</span>
                  )}
                </td>
                <td>
                  <div className="flex gap-2">
                    <select
                      value={selectedAction[d.id] ?? ACTION_TYPES[0]}
                      onChange={(e) => setSelectedAction((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      className="input w-auto py-1.5 text-xs"
                    >
                      {ACTION_TYPES.map((a) => (
                        <option key={a} value={a}>{t(`devices.action.${a}` as TranslationKey)}</option>
                      ))}
                    </select>
                    <button onClick={() => runAction(d.id, d.hostname)} disabled={runningAction === d.id} className="btn-secondary btn-sm">
                      {runningAction === d.id ? t('devices.queuing') : t('devices.run')}
                    </button>
                    <button
                      onClick={() => setViewingScreen({ id: d.id, name: d.hostname ?? d.id.slice(0, 8) })}
                      disabled={d.status !== 'ONLINE'}
                      className="btn-secondary btn-sm"
                      title={d.status !== 'ONLINE' ? t('devices.viewScreen.offline') : t('devices.viewScreen')}
                    >
                      <Icon name="eye" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setWipingDevice({ id: d.id, name: d.hostname ?? d.id.slice(0, 8) })}
                      className="btn-secondary btn-sm text-red-600 hover:bg-red-50"
                      title={t('devices.wipe.button')}
                    >
                      <Icon name="alert" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeDevice(d)}
                      className="btn-secondary btn-sm text-red-600 hover:bg-red-50"
                      title={t('devices.remove')}
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewingScreen && (
        <LiveScreenViewer deviceId={viewingScreen.id} deviceName={viewingScreen.name} onClose={() => setViewingScreen(null)} />
      )}

      {wipingDevice && (
        <WipeDeviceModal
          deviceId={wipingDevice.id}
          deviceName={wipingDevice.name}
          onClose={() => setWipingDevice(null)}
          onWiped={() => {
            setWipingDevice(null);
            setActionMessage(t('devices.wipe.queued', { device: wipingDevice.name }));
          }}
        />
      )}
    </div>
  );
}
