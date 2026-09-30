'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatBytes } from '@/lib/events';
import { useClientFilter } from '@/lib/ClientFilter';
import { useDevices } from '@/lib/useDevices';
import { Icon } from '@/lib/icons';
import { EmptyRow, ErrorBanner, LoadingRow, PageHeader } from '@/lib/ui';

interface HardwareRow {
  id: string;
  hostname: string | null;
  loggedInUser: string | null;
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

export default function HardwarePage() {
  const { t, formatDateTime } = useI18n();
  const { clientId } = useClientFilter();
  const { devices: deviceOptions } = useDevices();
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState<HardwareRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => setDeviceId(''), [clientId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (clientId) params.set('clientId', clientId);
    if (deviceId) params.set('deviceId', deviceId);
    apiFetch<HardwareRow[]>(`/hardware?${params}`)
      .then((data) => {
        setDevices(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' })))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, deviceId]);

  const visible = devices.filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${d.hostname ?? ''} ${d.loggedInUser ?? ''}`.toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader title={t('hardware.title')} subtitle={t('hardware.subtitle')} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t('devices.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">{t('common.allDevices')}</option>
          {deviceOptions.map((d) => (
            <option key={d.id} value={d.id}>{d.hostname ?? d.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      <ErrorBanner message={error} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('common.device')}</th>
              <th>{t('devices.col.loggedInUser')}</th>
              <th>{t('hardware.col.cpu')}</th>
              <th>{t('hardware.col.ram')}</th>
              <th>{t('hardware.col.gpu')}</th>
              <th>{t('hardware.col.board')}</th>
              <th>{t('hardware.col.last')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={7} />}
            {!loading && visible.length === 0 && (
              <EmptyRow colSpan={7} icon="cpu">{devices.length === 0 ? t('hardware.empty') : t('hardware.noMatch')}</EmptyRow>
            )}
            {visible.map((d) => (
              <tr key={d.id} className="align-top hover:bg-slate-50">
                <td className="font-medium text-slate-900">{d.hostname ?? '—'}</td>
                <td className="text-slate-600">{d.loggedInUser ?? <span className="text-slate-400">{t('devices.noUserLoggedIn')}</span>}</td>
                <td>
                  {d.hardware?.cpu ?? '—'}
                  {d.hardware?.cpuCores ? (
                    <div className="text-xs text-slate-500">{t('hardware.cores', { n: d.hardware.cpuCores })}</div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap">{d.hardware?.ramTotalBytes ? formatBytes(d.hardware.ramTotalBytes) : '—'}</td>
                <td>{d.hardware?.gpu ?? '—'}</td>
                <td>{d.hardware?.motherboard ?? '—'}</td>
                <td className="whitespace-nowrap text-slate-600">
                  {d.lastInventoryAt ? formatDateTime(d.lastInventoryAt) : t('common.never')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
