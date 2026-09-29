'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError, getSessionUser } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { Badge, EmptyRow, ErrorBanner, LoadingRow, PageHeader } from '@/lib/ui';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  hasPassword: boolean;
  clientId: string | null;
  client: { id: string; name: string } | null;
}

interface Client {
  id: string;
  name: string;
}

const ROLES = ['OWNER', 'ADMINISTRATOR', 'SECURITY_ADMIN', 'IT_ADMIN', 'ANALYST', 'VIEWER'] as const;

export default function UsersPage() {
  const { t, formatDateTime } = useI18n();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('VIEWER');
  const [visibility, setVisibility] = useState<'all' | 'specific'>('all');
  const [clientId, setClientId] = useState('');

  const self = getSessionUser();

  async function load() {
    try {
      const [u, c] = await Promise.all([apiFetch<UserRow[]>('/users'), apiFetch<Client[]>('/clients')]);
      setUsers(u);
      setClients(c);
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
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, role, clientId: visibility === 'specific' ? clientId : undefined }),
      });
      setName('');
      setEmail('');
      setRole('VIEWER');
      setVisibility('all');
      setClientId('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: UserRow) {
    setError(null);
    try {
      await apiFetch(`/users/${user.id}/${user.isActive ? 'deactivate' : 'activate'}`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    }
  }

  return (
    <div>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} />

      <form onSubmit={handleSubmit} className="card mb-8 grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="label">{t('users.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
        </div>
        <div>
          <label className="label">{t('users.email')}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
        </div>
        <div>
          <label className="label">{t('users.role')}</label>
          <select value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])} className="input">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`users.role.${r}` as TranslationKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('clients.visibility')}</label>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'all' | 'specific')} className="input">
            <option value="all">{t('clients.visibility.all')}</option>
            <option value="specific">{t('clients.visibility.specific')}</option>
          </select>
        </div>
        {visibility === 'specific' && (
          <div className="sm:col-span-2">
            <label className="label">{t('clients.title')}</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} required className="input">
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
        )}
        <div className="flex items-end justify-end sm:col-span-2">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? t('users.inviting') : t('users.invite')}
          </button>
        </div>
      </form>

      <ErrorBanner message={error} />

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('users.name')}</th>
              <th>{t('users.email')}</th>
              <th>{t('users.role')}</th>
              <th>{t('clients.title')}</th>
              <th>{t('users.col.status')}</th>
              <th>{t('common.updated')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={7} />}
            {!loading && users.length === 0 && (
              <EmptyRow colSpan={7} icon="users">
                {t('users.empty')}
              </EmptyRow>
            )}
            {users.map((u) => (
              <tr key={u.id} className="align-top hover:bg-slate-50">
                <td className="font-medium text-slate-900">{u.name}</td>
                <td className="text-slate-600">{u.email}</td>
                <td>
                  <Badge tone="blue">{t(`users.role.${u.role}` as TranslationKey)}</Badge>
                </td>
                <td className="text-slate-600">{u.client?.name ?? t('clients.allClients')}</td>
                <td>
                  {!u.isActive ? (
                    <Badge tone="slate">{t('users.status.inactive')}</Badge>
                  ) : !u.hasPassword ? (
                    <Badge tone="amber">{t('users.status.pending')}</Badge>
                  ) : (
                    <Badge tone="green">{t('users.status.active')}</Badge>
                  )}
                </td>
                <td className="whitespace-nowrap text-slate-600">{formatDateTime(u.createdAt)}</td>
                <td className="text-right">
                  {u.id !== self?.userId && (
                    <button onClick={() => toggleActive(u)} className="text-sm font-medium text-brand hover:underline">
                      {u.isActive ? t('users.deactivate') : t('users.activate')}
                    </button>
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
