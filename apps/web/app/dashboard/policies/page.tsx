'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { Badge, EmptyRow, ErrorBanner, LoadingRow, PageHeader } from '@/lib/ui';

interface PolicyRow {
  id: string;
  scope: string;
  scopeId: string | null;
  type: string;
  settings: Record<string, unknown>;
  version: number;
  updatedAt: string;
}

const SCOPES = ['TENANT', 'SITE', 'GROUP', 'DEVICE'];
const TYPES = ['BROWSER', 'FILE', 'USB', 'APPLICATION', 'SECURITY', 'AGENT', 'COLLECTION'];

const SETTINGS_PLACEHOLDER: Record<string, string> = {
  BROWSER: '{"urlPolicy": "SANITIZED_URL"}',
  FILE: '{"watchFolders": ["Desktop", "Documents"]}',
  USB: '{"defaultPolicy": "BLOCK"}',
  APPLICATION: '{"suspiciousProcessNames": ["mimikatz.exe"]}',
  SECURITY: '{"collectorIntervalSeconds": 1800}',
  AGENT: '{"heartbeatIntervalSeconds": 60}',
  COLLECTION: '{"usbCollectorEnabled": false}',
};

export default function PoliciesPage() {
  const { t, formatDateTime } = useI18n();
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [scope, setScope] = useState('TENANT');
  const [scopeId, setScopeId] = useState('');
  const [type, setType] = useState('BROWSER');
  const [settingsText, setSettingsText] = useState(SETTINGS_PLACEHOLDER.BROWSER);

  async function load() {
    try {
      setPolicies(await apiFetch<PolicyRow[]>('/policies'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(settingsText);
    } catch {
      setError(t('policies.invalidJson'));
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/policies', {
        method: 'PUT',
        body: JSON.stringify({ scope, scopeId: scope === 'TENANT' ? undefined : scopeId, type, settings }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/policies/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    }
  }

  return (
    <div>
      <PageHeader title={t('policies.title')} subtitle={t('policies.subtitle')} />

      <form onSubmit={handleSubmit} className="card mb-8 p-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">{t('policies.scope')}</label>
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="input">
              {SCOPES.map((s) => (
                <option key={s} value={s}>{t(`policies.scope.${s}` as TranslationKey)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">
              {t('policies.scopeId')} {scope === 'TENANT' && `(${t('policies.scopeId.na')})`}
            </label>
            <input
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              disabled={scope === 'TENANT'}
              placeholder={scope === 'TENANT' ? '—' : 'id'}
              className="input"
            />
          </div>
          <div>
            <label className="label">{t('policies.type')}</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setSettingsText(SETTINGS_PLACEHOLDER[e.target.value]);
              }}
              className="input"
            >
              {TYPES.map((x) => (
                <option key={x} value={x}>{t(`policies.type.${x}` as TranslationKey)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? t('common.saving') : t('policies.save')}
            </button>
          </div>
        </div>
        <label className="label">{t('policies.settings')}</label>
        <textarea
          value={settingsText}
          onChange={(e) => setSettingsText(e.target.value)}
          rows={3}
          spellCheck={false}
          className="input font-mono text-xs"
        />
      </form>

      <ErrorBanner message={error} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('policies.scope')}</th>
              <th>{t('policies.type')}</th>
              <th>{t('policies.col.settings')}</th>
              <th>{t('common.version')}</th>
              <th>{t('common.updated')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={6} />}
            {!loading && policies.length === 0 && <EmptyRow colSpan={6} icon="sliders">{t('policies.empty')}</EmptyRow>}
            {policies.map((p) => (
              <tr key={p.id} className="align-top hover:bg-slate-50">
                <td>
                  <Badge tone="blue">{t(`policies.scope.${p.scope}` as TranslationKey)}</Badge>
                  {p.scopeId && <span className="ml-2 font-mono text-xs text-slate-400">{p.scopeId.slice(0, 8)}</span>}
                </td>
                <td className="font-medium">{t(`policies.type.${p.type}` as TranslationKey)}</td>
                <td className="max-w-xs truncate font-mono text-xs text-slate-500" title={JSON.stringify(p.settings)}>
                  {JSON.stringify(p.settings)}
                </td>
                <td className="tabular-nums">{p.version}</td>
                <td className="whitespace-nowrap text-slate-600">{formatDateTime(p.updatedAt)}</td>
                <td>
                  <button onClick={() => handleDelete(p.id)} className="btn-secondary btn-sm">
                    {t('common.remove')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
