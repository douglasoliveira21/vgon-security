'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError, setSession } from '@/lib/api';

interface LoginResponse {
  accessToken: string;
  user: { id: string; tenantId: string; email: string; role: string; name: string };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@acme-demo.test');
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
      });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-brand-dark">VGON Security+</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in to your tenant</p>

        <label className="mb-1 block text-sm font-medium">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
