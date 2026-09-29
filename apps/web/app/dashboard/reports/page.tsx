'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { ErrorBanner, PageHeader, StatCard } from '@/lib/ui';

interface Overview {
  totalDevices: number;
  deviceStatusCounts: Record<string, number>;
  openFindingsBySeverity: Record<string, number>;
  eventsLast24h: number;
  eventsLast7d: number;
  activeSoftwarePackages: number;
}

interface TimeseriesPoint {
  date: string;
  count: number;
}

interface CountRow {
  eventType?: string;
  domain?: string;
  count: number;
}

const STATUS_ORDER = ['ONLINE', 'STALE', 'OFFLINE', 'PENDING', 'BLOCKED', 'DECOMMISSIONED'];
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.max((count / max) * 100, 2) : 0;
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span className="truncate">{label}</span>
        <span className="font-semibold tabular-nums text-slate-800">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

export default function ReportsPage() {
  const { t, tOr } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [topEventTypes, setTopEventTypes] = useState<CountRow[]>([]);
  const [topDomains, setTopDomains] = useState<CountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [o, ts, types, domains] = await Promise.all([
          apiFetch<Overview>('/reports/overview'),
          apiFetch<TimeseriesPoint[]>('/reports/events-timeseries?days=14'),
          apiFetch<CountRow[]>('/reports/top-event-types?days=7'),
          apiFetch<CountRow[]>('/reports/top-domains?days=7'),
        ]);
        setOverview(o);
        setTimeseries(ts);
        setTopEventTypes(types);
        setTopDomains(domains);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-sm text-slate-400">{t('common.loading')}</p>;
  if (error) return <ErrorBanner message={error} />;
  if (!overview) return null;

  const maxTimeseries = Math.max(...timeseries.map((p) => p.count), 1);
  const maxEventTypeCount = Math.max(...topEventTypes.map((r) => r.count), 1);
  const maxDomainCount = Math.max(...topDomains.map((r) => r.count), 1);
  const empty = (key: TranslationKey) => <p className="text-sm text-slate-400">{t(key)}</p>;

  return (
    <div>
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('reports.kpi.devices')} value={overview.totalDevices} icon="devices" />
        <StatCard label={t('reports.kpi.events24h')} value={overview.eventsLast24h} icon="activity" tone="green" />
        <StatCard label={t('reports.kpi.events7d')} value={overview.eventsLast7d} icon="chart" tone="slate" />
        <StatCard label={t('reports.kpi.software')} value={overview.activeSoftwarePackages} icon="package" tone="amber" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel title={t('reports.byStatus')}>
          {STATUS_ORDER.filter((s) => overview.deviceStatusCounts[s]).map((s) => (
            <Bar key={s} label={t(`status.${s}` as TranslationKey)} count={overview.deviceStatusCounts[s] ?? 0} max={overview.totalDevices} />
          ))}
          {Object.keys(overview.deviceStatusCounts).length === 0 && empty('reports.noDevices')}
        </Panel>

        <Panel title={t('reports.findings')}>
          {SEVERITY_ORDER.filter((s) => overview.openFindingsBySeverity[s]).map((s) => (
            <Bar
              key={s}
              label={t(`severity.${s}` as TranslationKey)}
              count={overview.openFindingsBySeverity[s] ?? 0}
              max={Math.max(...Object.values(overview.openFindingsBySeverity), 1)}
            />
          ))}
          {Object.keys(overview.openFindingsBySeverity).length === 0 && empty('reports.noFindings')}
        </Panel>
      </div>

      <div className="mb-6">
        <Panel title={t('reports.perDay')}>
          <div className="flex h-36 items-end gap-1.5">
            {timeseries.map((p) => (
              <div key={p.date} className="group relative flex h-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-brand/80 transition-colors group-hover:bg-brand"
                  style={{ height: `${Math.max((p.count / maxTimeseries) * 100, 2)}%` }}
                />
                <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100">
                  {p.date}: {p.count}
                </div>
              </div>
            ))}
            {timeseries.length === 0 && empty('reports.noEvents')}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('reports.topEvents')}>
          {topEventTypes.map((r) => (
            <Bar
              key={r.eventType}
              label={tOr(`event.${r.eventType}`, r.eventType ?? '—')}
              count={r.count}
              max={maxEventTypeCount}
            />
          ))}
          {topEventTypes.length === 0 && empty('reports.noEvents')}
        </Panel>

        <Panel title={t('reports.topDomains')}>
          {topDomains.map((r) => (
            <Bar key={r.domain} label={r.domain ?? '—'} count={r.count} max={maxDomainCount} />
          ))}
          {topDomains.length === 0 && empty('reports.noBrowsing')}
        </Panel>
      </div>
    </div>
  );
}
