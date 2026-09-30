'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { EmptyRow, ErrorBanner, LoadingRow, PageHeader } from '@/lib/ui';

interface Client {
  id: string;
  name: string;
  createdAt: string;
  _count: { sites: number; devices: number; users: number };
}

export default function ClientsPage() {
  const { t } = useI18n();
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setClients(await apiFetch<Client[]>('/clients'));
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
      await apiFetch('/clients', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeClient(client: Client) {
    if (!window.confirm(t('org.deleteConfirm', { name: client.name }))) return;
    setError(null);
    try {
      await apiFetch(`/clients/${client.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    }
  }

  function startEdit(client: Client) {
    setEditingId(client.id);
    setEditName(client.name);
  }

  async function saveEdit(clientId: string) {
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/clients/${clientId}`, { method: 'PATCH', body: JSON.stringify({ name: editName }) });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('clients.title')} subtitle={t('clients.subtitle')} />

      <form onSubmit={handleSubmit} className="card mb-8 flex items-end gap-3 p-5">
        <div className="flex-1">
          <label className="label">{t('clients.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary">
          {t('clients.add')}
        </button>
      </form>

      <ErrorBanner message={error} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('clients.name')}</th>
              <th>{t('org.locations')}</th>
              <th>{t('common.device')}</th>
              <th>{t('nav.users')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={5} />}
            {!loading && clients.length === 0 && (
              <EmptyRow colSpan={5} icon="users">
                {t('clients.empty')}
              </EmptyRow>
            )}
            {clients.map((c) =>
              editingId === c.id ? (
                <tr key={c.id} className="align-top bg-slate-50">
                  <td colSpan={5} className="p-3">
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="label">{t('clients.name')}</label>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" />
                      </div>
                      <button onClick={() => setEditingId(null)} className="btn-secondary btn-sm">
                        {t('common.cancel')}
                      </button>
                      <button onClick={() => saveEdit(c.id)} disabled={saving} className="btn-primary btn-sm">
                        {saving ? t('common.saving') : t('common.save')}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className="align-top hover:bg-slate-50">
                  <td className="font-medium text-slate-900">{c.name}</td>
                  <td className="text-slate-600">{c._count.sites}</td>
                  <td className="text-slate-600">{c._count.devices}</td>
                  <td className="text-slate-600">{c._count.users}</td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => startEdit(c)} className="mr-3 text-sm font-medium text-brand hover:underline">
                      {t('common.edit')}
                    </button>
                    <button onClick={() => removeClient(c)} className="text-sm font-medium text-red-600 hover:underline">
                      {t('common.remove')}
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
