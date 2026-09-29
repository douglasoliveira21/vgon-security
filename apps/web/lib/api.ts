export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export interface SessionUser {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  // null = sees every client under the tenant; set = restricted to only that client's data.
  clientId?: string | null;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('vgon_access_token');
}

export function setSession(token: string, user: SessionUser) {
  window.localStorage.setItem('vgon_access_token', token);
  window.localStorage.setItem('vgon_user', JSON.stringify(user));
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('vgon_user');
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  window.localStorage.removeItem('vgon_access_token');
  window.localStorage.removeItem('vgon_user');
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    if (res.status === 401 && typeof window !== 'undefined') {
      // The web JWT is short-lived (15 min) — without this, every page that polls on an
      // interval (Screenshots, Events, ...) would otherwise keep re-throwing this same error
      // every few seconds forever instead of sending the person back to sign in again.
      clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    throw new ApiError(res.status, body.message ?? 'Request failed');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
