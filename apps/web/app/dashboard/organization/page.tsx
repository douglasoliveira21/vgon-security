'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { EmptyRow, ErrorBanner, LoadingRow, PageHeader } from '@/lib/ui';

interface Client {
  id: string;
  name: string;
}

interface Site {
  id: string;
  name: string;
  clientId: string | null;
  client: { id: string; name: string } | null;
  createdAt: string;
  _count: { devices: number; groups: number };
}

interface Group {
  id: string;
  name: string;
  clientId: string | null;
  client: { id: string; name: string } | null;
  siteId: string | null;
  site: { id: string; name: string } | null;
  createdAt: string;
  _count: { devices: number };
}

export default function OrganizationPage() {
  const { t } = useI18n();
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [siteName, setSiteName] = useState('');
  const [siteClientId, setSiteClientId] = useState('');
  const [siteSubmitting, setSiteSubmitting] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [groupSiteId, setGroupSiteId] = useState('');
  const [groupClientId, setGroupClientId] = useState('');
  const [groupSubmitting, setGroupSubmitting] = useState(false);

  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteClientId, setEditSiteClientId] = useState('');
  const [savingSite, setSavingSite] = useState(false);

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupSiteId, setEditGroupSiteId] = useState('');
  const [editGroupClientId, setEditGroupClientId] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  async function load() {
    try {
      const [c, s, g] = await Promise.all([
        apiFetch<Client[]>('/clients'),
        apiFetch<Site[]>('/sites'),
        apiFetch<Group[]>('/groups'),
      ]);
      setClients(c);
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
      await apiFetch('/sites', { method: 'POST', body: JSON.stringify({ name: siteName, clientId: siteClientId }) });
      setSiteName('');
      setSiteClientId('');
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
        body: JSON.stringify({
          name: groupName,
          siteId: groupSiteId || undefined,
          clientId: groupSiteId ? undefined : groupClientId || undefined,
        }),
      });
      setGroupName('');
      setGroupSiteId('');
      setGroupClientId('');
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

  function startEditSite(site: Site) {
    setEditingSiteId(site.id);
    setEditSiteName(site.name);
    setEditSiteClientId(site.clientId ?? '');
  }

  async function saveSite(siteId: string) {
    setError(null);
    setSavingSite(true);
    try {
      await apiFetch(`/sites/${siteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editSiteName, clientId: editSiteClientId || undefined }),
      });
      setEditingSiteId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setSavingSite(false);
    }
  }

  function startEditGroup(group: Group) {
    setEditingGroupId(group.id);
    setEditGroupName(group.name);
    setEditGroupSiteId(group.siteId ?? '');
    setEditGroupClientId(group.clientId ?? '');
  }

  async function saveGroup(groupId: string) {
    setError(null);
    setSavingGroup(true);
    try {
      await apiFetch(`/groups/${groupId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editGroupName,
          siteId: editGroupSiteId,
          clientId: editGroupSiteId ? undefined : editGroupClientId || undefined,
        }),
      });
      setEditingGroupId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setSavingGroup(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('org.title')} subtitle={t('org.subtitle')} />

      <ErrorBanner message={error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('org.locations')}</h2>
          <form onSubmit={createSite} className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label className="label">{t('org.siteName')}</label>
              <input value={siteName} onChange={(e) => setSiteName(e.target.value)} required className="input" />
            </div>
            <div>
              <label className="label">{t('clients.title')}</label>
              <select value={siteClientId} onChange={(e) => setSiteClientId(e.target.value)} required className="input">
                <option value="" disabled>
                  {t('org.selectClient')}
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
                  <th>{t('clients.title')}</th>
                  <th>{t('common.device')}</th>
                  <th>{t('org.groups')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading && <LoadingRow colSpan={5} />}
                {!loading && sites.length === 0 && (
                  <EmptyRow colSpan={5} icon="mapPin">
                    {t('org.sitesEmpty')}
                  </EmptyRow>
                )}
                {sites.map((s) =>
                  editingSiteId === s.id ? (
                    <tr key={s.id} className="align-top bg-slate-50">
                      <td colSpan={5} className="p-3">
                        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                          <div>
                            <label className="label">{t('org.siteName')}</label>
                            <input value={editSiteName} onChange={(e) => setEditSiteName(e.target.value)} className="input" />
                          </div>
                          <div>
                            <label className="label">{t('clients.title')}</label>
                            <select value={editSiteClientId} onChange={(e) => setEditSiteClientId(e.target.value)} className="input">
                              {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button onClick={() => saveSite(s.id)} disabled={savingSite} className="btn-primary btn-sm">
                            {savingSite ? t('common.saving') : t('common.save')}
                          </button>
                          <button onClick={() => setEditingSiteId(null)} className="btn-secondary btn-sm">
                            {t('common.cancel')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id} className="align-top hover:bg-slate-50">
                      <td className="font-medium text-slate-900">{s.name}</td>
                      <td className="text-slate-600">{s.client?.name ?? '—'}</td>
                      <td className="text-slate-600">{t('org.devices', { n: s._count.devices })}</td>
                      <td className="text-slate-600">{t('org.groupsCount', { n: s._count.groups })}</td>
                      <td className="whitespace-nowrap text-right">
                        <button onClick={() => startEditSite(s)} className="mr-3 text-sm font-medium text-brand hover:underline">
                          {t('common.edit')}
                        </button>
                        <button onClick={() => removeSite(s)} className="text-sm font-medium text-red-600 hover:underline">
                          {t('common.remove')}
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('org.groups')}</h2>
          <form onSubmit={createGroup} className="card mb-4 grid gap-3 p-4">
            <div>
              <label className="label">{t('org.groupName')}</label>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} required className="input" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">{t('org.locations')}</label>
                <select value={groupSiteId} onChange={(e) => setGroupSiteId(e.target.value)} className="input">
                  <option value="">{t('org.noSite')}</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {!groupSiteId && (
                <div>
                  <label className="label">{t('clients.title')}</label>
                  <select value={groupClientId} onChange={(e) => setGroupClientId(e.target.value)} className="input">
                    <option value="">{t('org.selectClient')}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={groupSubmitting} className="btn-primary">
                {t('org.addGroup')}
              </button>
            </div>
          </form>

          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('org.groupName')}</th>
                  <th>{t('clients.title')}</th>
                  <th>{t('org.locations')}</th>
                  <th>{t('common.device')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading && <LoadingRow colSpan={5} />}
                {!loading && groups.length === 0 && (
                  <EmptyRow colSpan={5} icon="users">
                    {t('org.groupsEmpty')}
                  </EmptyRow>
                )}
                {groups.map((g) =>
                  editingGroupId === g.id ? (
                    <tr key={g.id} className="align-top bg-slate-50">
                      <td colSpan={5} className="p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="label">{t('org.groupName')}</label>
                            <input value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} className="input" />
                          </div>
                          <div>
                            <label className="label">{t('org.locations')}</label>
                            <select value={editGroupSiteId} onChange={(e) => setEditGroupSiteId(e.target.value)} className="input">
                              <option value="">{t('org.noSite')}</option>
                              {sites.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          {!editGroupSiteId && (
                            <div>
                              <label className="label">{t('clients.title')}</label>
                              <select value={editGroupClientId} onChange={(e) => setEditGroupClientId(e.target.value)} className="input">
                                <option value="">{t('org.selectClient')}</option>
                                {clients.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button onClick={() => setEditingGroupId(null)} className="btn-secondary btn-sm">
                            {t('common.cancel')}
                          </button>
                          <button onClick={() => saveGroup(g.id)} disabled={savingGroup} className="btn-primary btn-sm">
                            {savingGroup ? t('common.saving') : t('common.save')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={g.id} className="align-top hover:bg-slate-50">
                      <td className="font-medium text-slate-900">{g.name}</td>
                      <td className="text-slate-600">{g.client?.name ?? '—'}</td>
                      <td className="text-slate-600">{g.site?.name ?? t('org.noSite')}</td>
                      <td className="text-slate-600">{t('org.devices', { n: g._count.devices })}</td>
                      <td className="whitespace-nowrap text-right">
                        <button onClick={() => startEditGroup(g)} className="mr-3 text-sm font-medium text-brand hover:underline">
                          {t('common.edit')}
                        </button>
                        <button onClick={() => removeGroup(g)} className="text-sm font-medium text-red-600 hover:underline">
                          {t('common.remove')}
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
