'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { EmptyRow, ErrorBanner, LoadingRow, PageHeader } from '@/lib/ui';

interface Site {
  id: string;
  name: string;
  createdAt: string;
  _count: { devices: number; groups: number };
}

interface Group {
  id: string;
  name: string;
  siteId: string | null;
  site: { id: string; name: string } | null;
  createdAt: string;
  _count: { devices: number };
}

export default function OrganizationPage() {
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [siteName, setSiteName] = useState('');
  const [siteSubmitting, setSiteSubmitting] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [groupSiteId, setGroupSiteId] = useState('');
  const [groupSubmitting, setGroupSubmitting] = useState(false);

  async function load() {
    try {
      const [s, g] = await Promise.all([apiFetch<Site[]>('/sites'), apiFetch<Group[]>('/groups')]);
      setSites(s);
      setGroups(g);
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

  async function createSite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSiteSubmitting(true);
    try {
      await apiFetch('/sites', { method: 'POST', body: JSON.stringify({ name: siteName }) });
      setSiteName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setSiteSubmitting(false);
    }
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGroupSubmitting(true);
    try {
      await apiFetch('/groups', {
        method: 'POST',
        body: JSON.stringify({ name: groupName, siteId: groupSiteId || undefined }),
      });
      setGroupName('');
      setGroupSiteId('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function removeSite(site: Site) {
    if (!window.confirm(t('org.deleteConfirm', { name: site.name }))) return;
    setError(null);
    try {
      await apiFetch(`/sites/${site.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    }
  }

  async function removeGroup(group: Group) {
    if (!window.confirm(t('org.deleteConfirm', { name: group.name }))) return;
    setError(null);
    try {
      await apiFetch(`/groups/${group.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    }
  }

  return (
    <div>
      <PageHeader title={t('org.title')} subtitle={t('org.subtitle')} />

      <ErrorBanner message={error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('org.sites')}</h2>
          <form onSubmit={createSite} className="card mb-4 flex items-end gap-3 p-4">
            <div className="flex-1">
              <label className="label">{t('org.siteName')}</label>
              <input value={siteName} onChange={(e) => setSiteName(e.target.value)} required className="input" />
            </div>
            <button type="submit" disabled={siteSubmitting} className="btn-primary">
              {t('org.addSite')}
            </button>
          </form>

          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('org.siteName')}</th>
                  <th>{t('common.device')}</th>
                  <th>{t('org.groups')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading && <LoadingRow colSpan={4} />}
                {!loading && sites.length === 0 && (
                  <EmptyRow colSpan={4} icon="mapPin">
                    {t('org.sitesEmpty')}
                  </EmptyRow>
                )}
                {sites.map((s) => (
                  <tr key={s.id} className="align-top hover:bg-slate-50">
                    <td className="font-medium text-slate-900">{s.name}</td>
                    <td className="text-slate-600">{t('org.devices', { n: s._count.devices })}</td>
                    <td className="text-slate-600">{t('org.groupsCount', { n: s._count.groups })}</td>
                    <td className="text-right">
                      <button onClick={() => removeSite(s)} className="text-sm font-medium text-red-600 hover:underline">
                        {t('common.remove')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('org.groups')}</h2>
          <form onSubmit={createGroup} className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label className="label">{t('org.groupName')}</label>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} required className="input" />
            </div>
            <div>
              <label className="label">{t('org.sites')}</label>
              <select value={groupSiteId} onChange={(e) => setGroupSiteId(e.target.value)} className="input">
                <option value="">{t('org.noSite')}</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={groupSubmitting} className="btn-primary">
              {t('org.addGroup')}
            </button>
          </form>

          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('org.groupName')}</th>
                  <th>{t('org.sites')}</th>
                  <th>{t('common.device')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading && <LoadingRow colSpan={4} />}
                {!loading && groups.length === 0 && (
                  <EmptyRow colSpan={4} icon="users">
                    {t('org.groupsEmpty')}
                  </EmptyRow>
                )}
                {groups.map((g) => (
                  <tr key={g.id} className="align-top hover:bg-slate-50">
                    <td className="font-medium text-slate-900">{g.name}</td>
                    <td className="text-slate-600">{g.site?.name ?? t('org.noSite')}</td>
                    <td className="text-slate-600">{t('org.devices', { n: g._count.devices })}</td>
                    <td className="text-right">
                      <button onClick={() => removeGroup(g)} className="text-sm font-medium text-red-600 hover:underline">
                        {t('common.remove')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
