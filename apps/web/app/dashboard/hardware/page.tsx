'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatBytes } from '@/lib/events';
import { useClientFilter } from '@/lib/ClientFilter';
import { useDevices } from '@/lib/useDevices';
import { EmptyRow, ErrorBanner, LoadingRow, PageHeader } from '@/lib/ui';

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

export default function HardwarePage() {
  const { t, formatDateTime } = useI18n();
  const { clientId } = useClientFilter();
  const { devices: deviceOptions } = useDevices();
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState<HardwareRow[]>([]);
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

  return (
    <div>
      <PageHeader title={t('hardware.title')} subtitle={t('hardware.subtitle')} />

      <div className="mb-4">
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
              <th>{t('hardware.col.cpu')}</th>
              <th>{t('hardware.col.ram')}</th>
              <th>{t('hardware.col.gpu')}</th>
              <th>{t('hardware.col.board')}</th>
              <th>{t('hardware.col.last')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={6} />}
            {!loading && devices.length === 0 && <EmptyRow colSpan={6} icon="cpu">{t('hardware.empty')}</EmptyRow>}
            {devices.map((d) => (
              <tr key={d.id} className="align-top hover:bg-slate-50">
                <td className="font-medium text-slate-900">{d.hostname ?? '—'}</td>
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
