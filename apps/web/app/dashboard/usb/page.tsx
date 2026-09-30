'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { useDevices } from '@/lib/useDevices';
import { useClientFilter } from '@/lib/ClientFilter';
import { formatBytes } from '@/lib/events';
import { Icon } from '@/lib/icons';
import { Badge, EmptyRow, ErrorBanner, LoadingRow, PageHeader, Timestamp, Tone } from '@/lib/ui';

interface UsbEventRow {
  id: string;
  deviceId: string;
  eventType: string;
  severity: string;
  occurredAt: string;
  data: {
    vendorId?: string;
    productId?: string;
    serial?: string;
    manufacturer?: string;
    model?: string;
    capacityBytes?: number;
    user?: string;
    policyDecision?: string;
    blocked?: boolean;
  };
}

const DECISION_TONE: Record<string, Tone> = { ALLOWED: 'green', MONITORED: 'slate', BLOCKED: 'red' };

export default function UsbPage() {
  const { t, tOr } = useI18n();
  const { devices, nameOf } = useDevices();
  const { clientId } = useClientFilter();
  const [deviceId, setDeviceId] = useState('');
  const [events, setEvents] = useState<UsbEventRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => setDeviceId(''), [clientId]);

  async function load() {
    try {
      const params = new URLSearchParams({ take: '50' });
      if (clientId) params.set('clientId', clientId);
      if (deviceId) params.set('deviceId', deviceId);
      const connectedParams = new URLSearchParams(params);
      connectedParams.set('eventType', 'usb.connected');
      const disconnectedParams = new URLSearchParams(params);
      disconnectedParams.set('eventType', 'usb.disconnected');
      const [connected, disconnected] = await Promise.all([
        apiFetch<UsbEventRow[]>(`/events?${connectedParams}`),
        apiFetch<UsbEventRow[]>(`/events?${disconnectedParams}`),
      ]);
      setEvents(
        [...connected, ...disconnected].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
      );
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
    return `${e.data.user ?? ''} ${e.data.model ?? ''} ${e.data.serial ?? ''} ${e.data.manufacturer ?? ''}`
      .toLowerCase()
      .includes(q);
  });

  return (
    <div>
      <PageHeader title={t('usb.title')} subtitle={t('usb.subtitle')} meta={t('common.refreshEvery', { seconds: 15 })} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t('usb.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <th>{t('usb.col.event')}</th>
              <th>{t('usb.col.model')}</th>
              <th>{t('usb.col.serial')}</th>
              <th>{t('usb.col.capacity')}</th>
              <th>{t('usb.col.policy')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={8} />}
            {!loading && visible.length === 0 && (
              <EmptyRow colSpan={8} icon="usb">{events.length === 0 ? t('usb.empty') : t('usb.noMatch')}</EmptyRow>
            )}
            {visible.map((e) => (
              <tr key={e.id} className="align-top hover:bg-slate-50">
                <td><Timestamp iso={e.occurredAt} /></td>
                <td className="font-medium text-slate-800">{nameOf(e.deviceId)}</td>
                <td className="text-slate-600">{e.data.user ?? '—'}</td>
                <td>
                  <Badge tone={e.eventType === 'usb.connected' ? 'blue' : 'slate'}>
                    {e.eventType === 'usb.connected' ? t('usb.connected') : t('usb.disconnected')}
                  </Badge>
                </td>
                <td>{e.data.model ?? '—'}</td>
                <td className="font-mono text-xs text-slate-600">{e.data.serial ?? '—'}</td>
                <td className="whitespace-nowrap text-slate-600">{e.data.capacityBytes ? formatBytes(e.data.capacityBytes) : '—'}</td>
                <td>
                  {e.data.policyDecision && (
                    <Badge tone={DECISION_TONE[e.data.policyDecision] ?? 'slate'}>
                      {tOr(`usb.decision.${e.data.policyDecision}` as TranslationKey, e.data.policyDecision)}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
