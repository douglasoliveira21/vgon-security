'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { useDevices } from '@/lib/useDevices';
import { useClientFilter } from '@/lib/ClientFilter';
import { detailRows, EVENT_CATEGORIES, eventMeta, summarize, typesInCategory } from '@/lib/events';
import { Icon } from '@/lib/icons';
import { EmptyRow, ErrorBanner, LoadingRow, PageHeader, SeverityBadge } from '@/lib/ui';

interface EventRow {
  id: string;
  deviceId: string;
  eventType: string;
  severity: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function EventsPage() {
  const i18n = useI18n();
  const { t, formatDateTime, formatTime, relativeTime } = i18n;
  const { devices, nameOf } = useDevices();
  const { clientId } = useClientFilter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const [category, setCategory] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [severity, setSeverity] = useState('');
  const [search, setSearch] = useState('');
  const [hideHeartbeats, setHideHeartbeats] = useState(true);

  async function load() {
    try {
      const params = new URLSearchParams({ take: '300' });
      if (deviceId) params.set('deviceId', deviceId);
      if (clientId) params.set('clientId', clientId);
      setEvents(await apiFetch<EventRow[]>(`/events?${params}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, clientId]);

  const visible = useMemo(() => {
    const types = category ? typesInCategory(category) : null;
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (hideHeartbeats && e.eventType === 'device.heartbeat') return false;
      if (types && !types.includes(e.eventType)) return false;
      if (severity && e.severity !== severity) return false;
      if (q) {
        const user = typeof e.data?.user === 'string' ? e.data.user : '';
        const hay = `${eventMeta(e.eventType, i18n).label} ${summarize(e, i18n)} ${nameOf(e.deviceId)} ${user}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, category, severity, search, hideHeartbeats, i18n.locale, devices]);

  return (
    <div>
      <PageHeader
        title={t('events.title')}
        subtitle={t('events.subtitle')}
        meta={`${t('events.count', { shown: visible.length, total: events.length })} · ${t('common.refreshEvery', { seconds: 10 })}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t('events.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t('events.allCategories')}</option>
          {EVENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`cat.${c}` as TranslationKey)}</option>
          ))}
        </select>
        <select className="input w-auto" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">{t('common.allDevices')}</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.hostname ?? d.id.slice(0, 8)}</option>
          ))}
        </select>
        <select className="input w-auto" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">{t('events.anySeverity')}</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{t(`severity.${s}` as TranslationKey)}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-1 text-sm text-slate-600">
          <input type="checkbox" checked={hideHeartbeats} onChange={(e) => setHideHeartbeats(e.target.checked)} />
          {t('events.hideHeartbeats')}
        </label>
      </div>

      <ErrorBanner message={error} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('common.time')}</th>
              <th>{t('common.device')}</th>
              <th>{t('events.col.event')}</th>
              <th>{t('common.severity')}</th>
              <th>{t('events.col.what')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={5} />}
            {!loading && visible.length === 0 && (
              <EmptyRow colSpan={5} icon="activity">
                {events.length === 0 ? t('events.empty') : t('events.noMatch')}
              </EmptyRow>
            )}
            {visible.map((e) => {
              const meta = eventMeta(e.eventType, i18n);
              const open = expanded === e.id;
              return (
                <Fragment key={e.id}>
                  <tr className="cursor-pointer align-top hover:bg-slate-50" onClick={() => setExpanded(open ? null : e.id)}>
                    <td className="whitespace-nowrap">
                      <div>{formatTime(e.occurredAt)}</div>
                      <div className="text-xs text-slate-400" title={formatDateTime(e.occurredAt)}>{relativeTime(e.occurredAt)}</div>
                    </td>
                    <td className="whitespace-nowrap font-medium text-slate-800">{nameOf(e.deviceId)}</td>
                    <td className="whitespace-nowrap">
                      <span className="mr-1.5">{meta.icon}</span>
                      {meta.label}
                    </td>
                    <td><SeverityBadge severity={e.severity} /></td>
                    <td className="max-w-md truncate text-slate-600">{summarize(e, i18n)}</td>
                  </tr>
                  {open && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-4 py-4">
                        <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1.5 text-sm">
                          <dt className="text-slate-500">{t('events.type')}</dt>
                          <dd className="font-mono text-xs">{e.eventType}</dd>
                          <dt className="text-slate-500">{t('common.time')}</dt>
                          <dd>{formatDateTime(e.occurredAt)}</dd>
                          <dt className="text-slate-500">{t('common.device')}</dt>
                          <dd>{nameOf(e.deviceId)} <span className="font-mono text-xs text-slate-400">{e.deviceId}</span></dd>
                          {detailRows(e, i18n).map(([label, value]) => (
                            <Fragment key={label}>
                              <dt className="text-slate-500">{label}</dt>
                              <dd className="break-all">{value}</dd>
                            </Fragment>
                          ))}
                        </dl>
                        <button
                          className="mt-3 text-xs font-medium text-brand hover:underline"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setShowRaw(!showRaw);
                          }}
                        >
                          {showRaw ? t('events.hideRaw') : t('events.showRaw')}
                        </button>
                        {showRaw && (
                          <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                            {JSON.stringify(e.data, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
