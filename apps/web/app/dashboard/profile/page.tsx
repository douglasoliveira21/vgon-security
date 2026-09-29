'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError, updateSessionUser } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PageHeader, SuccessBanner } from '@/lib/ui';
import { Icon } from '@/lib/icons';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: string;
}

export default function ProfilePage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [infoError, setInfoError] = useState<string | null>(null);
  const [infoSuccess, setInfoSuccess] = useState<string | null>(null);
  const [savingInfo, setSavingInfo] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    apiFetch<Profile>('/auth/profile')
      .then((p) => {
        setProfile(p);
        setName(p.name);
      })
      .catch((err) => setInfoError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' })))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setInfoError(null);
    setInfoSuccess(null);
    setSavingInfo(true);
    try {
      const updated = await apiFetch<Profile>('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name }) });
      setProfile(updated);
      updateSessionUser({ email: updated.email });
      setInfoSuccess(t('profile.infoSaved'));
    } catch (err) {
      setInfoError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setSavingInfo(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile.passwordMismatch'));
      return;
    }
    setSavingPassword(true);
    try {
      await apiFetch('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(t('profile.passwordSaved'));
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">{t('common.loading')}</p>;

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />

      <form onSubmit={saveInfo} className="card mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">{t('profile.section.info')}</h2>
        <div className="mb-4">
          <label className="label">{t('profile.email')}</label>
          <input value={profile?.email ?? ''} disabled className="input bg-slate-50 text-slate-500" />
        </div>
        <div className="mb-4">
          <label className="label">{t('profile.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} className="input" />
        </div>

        {infoError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {infoError}
          </p>
        )}
        <SuccessBanner message={infoSuccess} />

        <button type="submit" disabled={savingInfo} className="btn-primary">
          {savingInfo ? t('profile.savingInfo') : t('profile.saveInfo')}
        </button>
      </form>

      <form onSubmit={savePassword} className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{t('profile.section.password')}</h2>
          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <Icon name={showPasswords ? 'eyeOff' : 'eye'} className="h-3.5 w-3.5" />
            {showPasswords ? t('login.hidePassword') : t('login.showPassword')}
          </button>
        </div>

        <div className="mb-4">
          <label className="label">{t('profile.currentPassword')}</label>
          <input
            type={showPasswords ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="input"
          />
        </div>
        <div className="mb-4">
          <label className="label">{t('profile.newPassword')}</label>
          <input
            type={showPasswords ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            className="input"
          />
        </div>
        <div className="mb-4">
          <label className="label">{t('profile.confirmPassword')}</label>
          <input
            type={showPasswords ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            className="input"
          />
        </div>

        {passwordError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {passwordError}
          </p>
        )}
        <SuccessBanner message={passwordSuccess} />

        <button type="submit" disabled={savingPassword} className="btn-primary">
          {savingPassword ? t('profile.savingPassword') : t('profile.savePassword')}
        </button>
      </form>
    </div>
  );
}
