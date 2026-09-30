'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useDevices } from '@/lib/useDevices';
import { useClientFilter } from '@/lib/ClientFilter';
import { EmptyRow, ErrorBanner, LoadingRow, PageHeader, Timestamp } from '@/lib/ui';

interface PrinterEventRow {
  id: string;
  deviceId: string;
  occurredAt: string;
  data: {
    printerName?: string;
    documentName?: string;
    user?: string;
    pages?: number;
  };
}

export default function PrintersPage() {
  const { t } = useI18n();
  const { devices, nameOf } = useDevices();
  const { clientId } = useClientFilter();
  const [deviceId, setDeviceId] = useState('');
  const [events, setEvents] = useState<PrinterEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => setDeviceId(''), [clientId]);

  async function load() {
    try {
      const params = new URLSearchParams({ eventType: 'printer.job', take: '100' });
      if (clientId) params.set('clientId', clientId);
      if (deviceId) params.set('deviceId', deviceId);
      setEvents(await apiFetch<PrinterEventRow[]>(`/events?${params}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, deviceId]);

  return (
    <div>
      <PageHeader title={t('printers.title')} subtitle={t('printers.subtitle')} meta={t('common.refreshEvery', { seconds: 15 })} />

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
              <th>{t('common.time')}</th>
              <th>{t('common.device')}</th>
              <th>{t('common.user')}</th>
              <th>{t('printers.col.printer')}</th>
              <th>{t('printers.col.document')}</th>
              <th>{t('printers.col.pages')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={6} />}
            {!loading && events.length === 0 && <EmptyRow colSpan={6} icon="printer">{t('printers.empty')}</EmptyRow>}
            {events.map((e) => (
              <tr key={e.id} className="align-top hover:bg-slate-50">
                <td><Timestamp iso={e.occurredAt} /></td>
                <td className="font-medium text-slate-800">{nameOf(e.deviceId)}</td>
                <td className="text-slate-600">{e.data.user ?? '—'}</td>
                <td>{e.data.printerName ?? '—'}</td>
                <td className="max-w-xs truncate">{e.data.documentName ?? '—'}</td>
                <td className="tabular-nums">{e.data.pages ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
