'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { useDevices } from '@/lib/useDevices';
import { formatBytes } from '@/lib/events';
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
  const { nameOf } = useDevices();
  const [events, setEvents] = useState<UsbEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [connected, disconnected] = await Promise.all([
        apiFetch<UsbEventRow[]>('/events?eventType=usb.connected&take=50'),
        apiFetch<UsbEventRow[]>('/events?eventType=usb.disconnected&take=50'),
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
  }, []);

  return (
    <div>
      <PageHeader title={t('usb.title')} subtitle={t('usb.subtitle')} meta={t('common.refreshEvery', { seconds: 15 })} />
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
            {!loading && events.length === 0 && <EmptyRow colSpan={8} icon="usb">{t('usb.empty')}</EmptyRow>}
            {events.map((e) => (
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
