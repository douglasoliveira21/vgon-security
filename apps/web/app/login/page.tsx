'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError, setSession } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { LanguageSwitch } from '@/lib/LanguageSwitch';
import { Icon } from '@/lib/icons';

interface LoginResponse {
  accessToken: string;
  user: { id: string; tenantId: string; email: string; role: string; name: string; clientId: string | null };
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setSession(res.accessToken, {
        userId: res.user.id,
        tenantId: res.user.tenantId,
        email: res.user.email,
        role: res.user.role,
        clientId: res.user.clientId,
      });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('login.failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-dark p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/30 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          {t('app.name')}
        </div>
        <div className="relative max-w-md">
          <h2 className="mb-8 text-3xl font-semibold leading-tight tracking-tight">{t('login.hero.title')}</h2>
          <ul className="space-y-4 text-slate-300">
            {(['login.hero.1', 'login.hero.2', 'login.hero.3'] as const).map((k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-emerald-300">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">{t('app.tagline')}</p>
      </aside>

      <main className="flex flex-col px-6 py-6">
        <div className="flex justify-end">
          <LanguageSwitch />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <form onSubmit={handleSubmit} className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2 text-brand-dark lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <span className="text-lg font-semibold">{t('app.name')}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('login.title')}</h1>
            <p className="mb-8 mt-1 text-sm text-slate-500">{t('login.subtitle')}</p>

            <label htmlFor="email" className="label">{t('login.email')}</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input mb-4"
            />

            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="password" className="label">{t('login.password')}</label>
              <Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">
                {t('login.forgotPassword')}
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
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
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
