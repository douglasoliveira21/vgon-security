'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { useDevices } from '@/lib/useDevices';
import { formatBytes } from '@/lib/events';
import { Badge, EmptyRow, ErrorBanner, LoadingRow, PageHeader, Timestamp, Tone } from '@/lib/ui';

interface FileEventRow {
  id: string;
  deviceId: string;
  eventType: string;
  occurredAt: string;
  data: {
    path?: string;
    name?: string;
    extension?: string;
    sizeBytes?: number;
    user?: string;
    previousPath?: string;
  };
}

const ACTION_TONE: Record<string, Tone> = {
  'file.created': 'green',
  'file.modified': 'blue',
  'file.renamed': 'amber',
  'file.deleted': 'red',
};

export default function FilesPage() {
  const { t } = useI18n();
  const { nameOf } = useDevices();
  const [events, setEvents] = useState<FileEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [created, modified, renamed, deleted] = await Promise.all(
        ['file.created', 'file.modified', 'file.renamed', 'file.deleted'].map((eventType) =>
          apiFetch<FileEventRow[]>(`/events?eventType=${eventType}&take=25`),
        ),
      );
      setEvents(
        [...created, ...modified, ...renamed, ...deleted].sort(
          (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
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
      <PageHeader
        title={t('files.title')}
        subtitle={t('files.subtitle')}
        meta={t('common.refreshEvery', { seconds: 15 })}
      />
      <ErrorBanner message={error} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('common.time')}</th>
              <th>{t('common.device')}</th>
              <th>{t('common.user')}</th>
              <th>{t('files.col.action')}</th>
              <th>{t('files.col.path')}</th>
              <th>{t('files.col.size')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={6} />}
            {!loading && events.length === 0 && <EmptyRow colSpan={6} icon="file">{t('files.empty')}</EmptyRow>}
            {events.map((e) => (
              <tr key={e.id} className="align-top hover:bg-slate-50">
                <td><Timestamp iso={e.occurredAt} /></td>
                <td className="font-medium text-slate-800">{nameOf(e.deviceId)}</td>
                <td className="text-slate-600">{e.data.user ?? '—'}</td>
                <td>
                  <Badge tone={ACTION_TONE[e.eventType] ?? 'slate'}>
                    {t(`files.action.${e.eventType}` as TranslationKey)}
                  </Badge>
                </td>
                <td className="max-w-md truncate font-mono text-xs text-slate-600" title={e.data.path}>
                  {e.eventType === 'file.renamed' && e.data.previousPath
                    ? `${e.data.previousPath} → ${e.data.path}`
                    : e.data.path ?? '—'}
                </td>
                <td className="whitespace-nowrap text-slate-600">{e.data.sizeBytes != null ? formatBytes(e.data.sizeBytes) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
