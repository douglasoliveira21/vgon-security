'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { LanguageSwitch } from '@/lib/LanguageSwitch';
import { Icon } from '@/lib/icons';

function ResetPasswordForm() {
  const { t } = useI18n();
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('resetPassword.title')}</h1>
        <p className="mb-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t('resetPassword.missingToken')}
        </p>
        <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
          {t('forgotPassword.title')}
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('resetPassword.title')}</h1>
        <p className="mb-6 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {t('resetPassword.success')}
        </p>
        <Link href="/login" className="text-sm font-medium text-brand hover:underline">
          {t('resetPassword.goToLogin')}
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('resetPassword.title')}</h1>
      <p className="mb-8 mt-1 text-sm text-slate-500">{t('resetPassword.subtitle')}</p>

      <label htmlFor="password" className="label">{t('resetPassword.newPassword')}</label>
      <input
        id="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="input mb-5"
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
        {loading ? t('resetPassword.submitting') : t('resetPassword.submit')}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col px-6 py-6">
      <div className="flex justify-end">
        <LanguageSwitch />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 text-brand-dark">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
              <Icon name="shield" className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold">{t('app.name')}</span>
          </div>
          <Suspense fallback={<p className="text-sm text-slate-500">{t('common.loading')}</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
