'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useDevices } from '@/lib/useDevices';
import { useClientFilter } from '@/lib/ClientFilter';
import { Icon } from '@/lib/icons';
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
  const [search, setSearch] = useState('');
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

  const visible = events.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${e.data.user ?? ''} ${e.data.printerName ?? ''} ${e.data.documentName ?? ''}`.toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader title={t('printers.title')} subtitle={t('printers.subtitle')} meta={t('common.refreshEvery', { seconds: 15 })} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t('printers.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
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
            {!loading && visible.length === 0 && (
              <EmptyRow colSpan={6} icon="printer">{events.length === 0 ? t('printers.empty') : t('printers.noMatch')}</EmptyRow>
            )}
            {visible.map((e) => (
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
