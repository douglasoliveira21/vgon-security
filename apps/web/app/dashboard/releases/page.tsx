'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, EmptyRow, ErrorBanner, LoadingRow, PageHeader } from '@/lib/ui';

interface Release {
  id: string;
  version: string;
  channel: string;
  downloadUrl: string;
  sha256: string;
  releaseNotes: string | null;
  mandatory: boolean;
  publishedAt: string;
}

export default function ReleasesPage() {
  const { t, formatDateTime } = useI18n();
  const [releases, setReleases] = useState<Release[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [version, setVersion] = useState('');
  const [channel, setChannel] = useState('STABLE');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [sha256, setSha256] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [mandatory, setMandatory] = useState(false);

  async function load() {
    try {
      setReleases(await apiFetch<Release[]>('/agent-releases'));
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
    setSubmitting(true);
    try {
      await apiFetch('/agent-releases', {
        method: 'POST',
        body: JSON.stringify({
          version,
          channel,
          downloadUrl,
          sha256: sha256.toLowerCase(),
          releaseNotes: releaseNotes || undefined,
          mandatory,
        }),
      });
      setVersion('');
      setDownloadUrl('');
      setSha256('');
      setReleaseNotes('');
      setMandatory(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('releases.title')} subtitle={t('releases.subtitle')} />

      <form onSubmit={handleSubmit} className="card mb-8 grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="label">{t('releases.version')}</label>
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.0" required className="input" />
        </div>
        <div>
          <label className="label">{t('releases.channel')}</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="input">
            <option value="STABLE">STABLE</option>
            <option value="BETA">BETA</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t('releases.downloadUrl')}</label>
          <input
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            placeholder="https://releases.example.com/VgonAgent-1.4.0.zip"
            required
            className="input"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t('releases.sha256')}</label>
          <input
            value={sha256}
            onChange={(e) => setSha256(e.target.value)}
            placeholder={t('releases.sha256.placeholder')}
            required
            className="input font-mono text-xs"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t('releases.notes')}</label>
          <textarea value={releaseNotes} onChange={(e) => setReleaseNotes(e.target.value)} rows={2} className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
          {t('releases.mandatory')}
        </label>
        <div className="flex items-end justify-end">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? t('releases.publishing') : t('releases.publish')}
          </button>
        </div>
      </form>

      <ErrorBanner message={error} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('common.version')}</th>
              <th>{t('releases.channel')}</th>
              <th>{t('releases.sha256')}</th>
              <th>{t('releases.col.mandatory')}</th>
              <th>{t('releases.col.published')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={5} />}
            {!loading && releases.length === 0 && <EmptyRow colSpan={5} icon="download">{t('releases.empty')}</EmptyRow>}
            {releases.map((r) => (
              <tr key={r.id} className="align-top hover:bg-slate-50">
                <td className="font-medium text-slate-900">{r.version}</td>
                <td><Badge tone={r.channel === 'STABLE' ? 'green' : 'amber'}>{r.channel}</Badge></td>
                <td className="max-w-xs truncate font-mono text-xs text-slate-500" title={r.sha256}>{r.sha256}</td>
                <td>{r.mandatory ? <Badge tone="red">{t('common.yes')}</Badge> : <span className="text-slate-400">—</span>}</td>
                <td className="whitespace-nowrap text-slate-600">{formatDateTime(r.publishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
