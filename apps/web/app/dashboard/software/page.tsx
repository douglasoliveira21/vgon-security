'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useDevices } from '@/lib/useDevices';
import { useClientFilter } from '@/lib/ClientFilter';
import { Icon } from '@/lib/icons';
import { EmptyRow, ErrorBanner, LoadingRow, PageHeader } from '@/lib/ui';

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
  const { t, formatDateTime } = useI18n();
  const { devices, nameOf, userOf } = useDevices();
  const { clientId } = useClientFilter();
  const [deviceId, setDeviceId] = useState('');
  const [items, setItems] = useState<SoftwareRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => setDeviceId(''), [clientId]);

  async function load(name?: string) {
    try {
      const params = new URLSearchParams();
      if (name) params.set('name', name);
      if (clientId) params.set('clientId', clientId);
      if (deviceId) params.set('deviceId', deviceId);
      setItems(await apiFetch<SoftwareRow[]>(`/software?${params}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(search || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, deviceId]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    load(search || undefined);
  }

  return (
    <div>
      <PageHeader
        title={t('software.title')}
        subtitle={t('software.subtitle')}
        actions={
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('software.search')}
                className="input w-56 pl-9"
              />
            </div>
            <button type="submit" className="btn-secondary">{t('common.search')}</button>
          </form>
        }
      />

      <div className="mb-4">
        <select className="input w-auto" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">{t('common.allDevices')}</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.hostname ?? d.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      <ErrorBanner message={error} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('software.col.name')}</th>
              <th>{t('software.col.version')}</th>
              <th>{t('software.col.publisher')}</th>
              <th>{t('software.col.arch')}</th>
              <th>{t('common.device')}</th>
              <th>{t('devices.col.loggedInUser')}</th>
              <th>{t('software.col.lastSeen')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={7} />}
            {!loading && items.length === 0 && <EmptyRow colSpan={7} icon="package">{t('software.empty')}</EmptyRow>}
            {items.map((s) => (
              <tr key={s.id} className="align-top hover:bg-slate-50">
                <td className="font-medium text-slate-900">{s.name}</td>
                <td className="font-mono text-xs text-slate-600">{s.version || '—'}</td>
                <td className="text-slate-600">{s.publisher ?? '—'}</td>
                <td className="text-slate-600">{s.architecture ?? '—'}</td>
                <td>{nameOf(s.deviceId)}</td>
                <td className="text-slate-600">{userOf(s.deviceId) ?? <span className="text-slate-400">{t('devices.noUserLoggedIn')}</span>}</td>
                <td className="whitespace-nowrap text-slate-600">{formatDateTime(s.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
