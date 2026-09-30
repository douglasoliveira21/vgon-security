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
  mfaEnabled: boolean;
}

interface MfaSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
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

  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(null);
  const [mfaConfirmToken, setMfaConfirmToken] = useState('');
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [showDisableMfa, setShowDisableMfa] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaSuccess, setMfaSuccess] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);

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

  async function startMfaSetup() {
    setMfaError(null);
    setMfaSuccess(null);
    setMfaBusy(true);
    try {
      setMfaSetup(await apiFetch<MfaSetupResponse>('/auth/mfa/setup', { method: 'POST' }));
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmMfaSetup(e: React.FormEvent) {
    e.preventDefault();
    setMfaError(null);
    setMfaBusy(true);
    try {
      await apiFetch('/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ token: mfaConfirmToken }) });
      setProfile((p) => (p ? { ...p, mfaEnabled: true } : p));
      setMfaSetup(null);
      setMfaConfirmToken('');
      setMfaSuccess(t('profile.mfa.enabled'));
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmMfaDisable(e: React.FormEvent) {
    e.preventDefault();
    setMfaError(null);
    setMfaBusy(true);
    try {
      await apiFetch('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password: mfaDisablePassword }) });
      setProfile((p) => (p ? { ...p, mfaEnabled: false } : p));
      setShowDisableMfa(false);
      setMfaDisablePassword('');
      setMfaSuccess(t('profile.mfa.disabled'));
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setMfaBusy(false);
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

      <div className="card mt-6 p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{t('profile.section.mfa')}</h2>
          {profile && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                profile.mfaEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {profile.mfaEnabled ? t('profile.mfa.statusOn') : t('profile.mfa.statusOff')}
            </span>
          )}
        </div>
        <p className="mb-4 text-sm text-slate-500">{t('profile.mfa.description')}</p>

        {mfaError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {mfaError}
          </p>
        )}
        <SuccessBanner message={mfaSuccess} />

        {profile && !profile.mfaEnabled && !mfaSetup && (
          <button onClick={startMfaSetup} disabled={mfaBusy} className="btn-primary">
            {mfaBusy ? t('profile.mfa.settingUp') : t('profile.mfa.enable')}
          </button>
        )}

        {mfaSetup && (
          <form onSubmit={confirmMfaSetup}>
            <p className="mb-3 text-sm text-slate-600">{t('profile.mfa.scanInstructions')}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mfaSetup.qrCodeDataUrl} alt="" className="mb-3 h-40 w-40 rounded-lg border border-slate-200" />
            <p className="mb-1 text-xs text-slate-500">{t('profile.mfa.manualKey')}</p>
            <code className="mb-4 block break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
              {mfaSetup.secret}
            </code>

            <label className="label">{t('profile.mfa.confirmCode')}</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={mfaConfirmToken}
              onChange={(e) => setMfaConfirmToken(e.target.value.replace(/\D/g, ''))}
              className="input mb-4 text-center text-lg tracking-[0.5em]"
              placeholder="000000"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMfaSetup(null);
                  setMfaConfirmToken('');
                }}
                className="btn-secondary"
              >
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={mfaBusy || mfaConfirmToken.length !== 6} className="btn-primary">
                {mfaBusy ? t('profile.mfa.confirming') : t('profile.mfa.confirm')}
              </button>
            </div>
          </form>
        )}

        {profile?.mfaEnabled && !showDisableMfa && (
          <button onClick={() => setShowDisableMfa(true)} className="text-sm font-medium text-red-600 hover:underline">
            {t('profile.mfa.disable')}
          </button>
        )}

        {showDisableMfa && (
          <form onSubmit={confirmMfaDisable}>
            <label className="label">{t('profile.currentPassword')}</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={mfaDisablePassword}
              onChange={(e) => setMfaDisablePassword(e.target.value)}
              className="input mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDisableMfa(false);
                  setMfaDisablePassword('');
                }}
                className="btn-secondary"
              >
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={mfaBusy} className="btn-primary bg-red-600 hover:bg-red-700">
                {mfaBusy ? t('profile.mfa.disabling') : t('profile.mfa.disableConfirm')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
