'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { useDevices } from '@/lib/useDevices';
import { useClientFilter } from '@/lib/ClientFilter';
import { EmptyRow, ErrorBanner, LoadingRow, PageHeader, SeverityBadge, Timestamp } from '@/lib/ui';

interface Finding {
  id: string;
  deviceId: string;
  code: string;
  title: string;
  description?: string;
  severity: string;
  status: string;
  detectedAt: string;
  resolvedAt?: string;
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

const SEVERITY_CARD: Record<string, string> = {
  CRITICAL: 'border-red-200 bg-red-50 text-red-700',
  HIGH: 'border-orange-200 bg-orange-50 text-orange-700',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700',
  LOW: 'border-blue-200 bg-blue-50 text-blue-700',
  INFO: 'border-slate-200 bg-white text-slate-600',
};

export default function SecurityCenterPage() {
  const { t } = useI18n();
  const { nameOf } = useDevices();
  const { clientId } = useClientFilter();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  async function load() {
    try {
      const params = new URLSearchParams({ status: statusFilter });
      if (clientId) params.set('clientId', clientId);
      setFindings(await apiFetch<Finding[]>(`/security/findings?${params}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, clientId]);

  async function resolve(id: string) {
    setResolving(id);
    try {
      await apiFetch(`/security/findings/${id}/resolve`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setResolving(null);
    }
  }

  const counts = SEVERITY_ORDER.reduce<Record<string, number>>((acc, sev) => {
    acc[sev] = findings.filter((f) => f.severity === sev).length;
    return acc;
  }, {});
  const sorted = [...findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return (
    <div>
      <PageHeader
        title={t('security.title')}
        subtitle={t('security.subtitle')}
        actions={
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {(['OPEN', 'RESOLVED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  statusFilter === s ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {s === 'OPEN' ? t('security.open') : t('security.resolved')}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {SEVERITY_ORDER.map((sev) => (
          <div key={sev} className={`rounded-xl border px-4 py-3 ${SEVERITY_CARD[sev]}`}>
            <div className="text-xs font-semibold uppercase tracking-wide">{t(`severity.${sev}` as TranslationKey)}</div>
            <div className="text-2xl font-semibold tabular-nums">{counts[sev]}</div>
          </div>
        ))}
      </div>

      <ErrorBanner message={error} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('common.severity')}</th>
              <th>{t('security.col.finding')}</th>
              <th>{t('common.device')}</th>
              <th>{t('security.col.detected')}</th>
              {statusFilter === 'OPEN' && <th />}
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={5} />}
            {!loading && sorted.length === 0 && (
              <EmptyRow colSpan={5} icon="shield">
                {statusFilter === 'OPEN' ? t('security.emptyOpen') : t('security.emptyResolved')}
              </EmptyRow>
            )}
            {sorted.map((f) => (
              <tr key={f.id} className="align-top hover:bg-slate-50">
                <td><SeverityBadge severity={f.severity} /></td>
                <td>
                  <div className="font-medium text-slate-900">{f.title}</div>
                  {f.description && <div className="text-xs text-slate-500">{f.description}</div>}
                </td>
                <td className="font-medium text-slate-800">{nameOf(f.deviceId)}</td>
                <td><Timestamp iso={f.detectedAt} /></td>
                {statusFilter === 'OPEN' && (
                  <td>
                    <button onClick={() => resolve(f.id)} disabled={resolving === f.id} className="btn-secondary btn-sm">
                      {resolving === f.id ? t('security.resolving') : t('security.resolve')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
