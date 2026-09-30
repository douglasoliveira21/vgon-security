export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export interface SessionUser {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  // null = sees every client under the tenant; set = restricted to only that client's data.
  clientId?: string | null;
}

const TOKEN_KEY = 'vgon_access_token';
const USER_KEY = 'vgon_user';

// "Remember me" decides where the session lives, not just how long the token lasts (the token's
// own lifetime is set server-side — see AuthService.login's rememberMe handling): localStorage
// survives closing the browser, sessionStorage is cleared with the tab/window.
function storageFor(remember: boolean): Storage {
  return remember ? window.localStorage : window.sessionStorage;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: SessionUser, remember = true) {
  const store = storageFor(remember);
  const other = storageFor(!remember);
  store.setItem(TOKEN_KEY, token);
  store.setItem(USER_KEY, JSON.stringify(user));
  // Clear the other storage so a later login with a different "remember me" choice can't leave
  // a stale, conflicting copy of the session behind.
  other.removeItem(TOKEN_KEY);
  other.removeItem(USER_KEY);
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY) ?? window.sessionStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Updates the cached session user in place (e.g. after a profile edit) without touching the token. */
export function updateSessionUser(patch: Partial<SessionUser>) {
  if (typeof window === 'undefined') return;
  const current = getSessionUser();
  if (!current) return;
  const updated = { ...current, ...patch };
  const store = window.localStorage.getItem(USER_KEY) ? window.localStorage : window.sessionStorage;
  store.setItem(USER_KEY, JSON.stringify(updated));
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: Record<string, unknown>,
  ) {
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
      // The web JWT is short-lived by default (15 min, or 30 days with "remember me") —
      // without this, every page that polls on an interval (Screenshots, Events, ...) would
      // otherwise keep re-throwing this same error every few seconds forever instead of sending
      // the person back to sign in again.
      clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    throw new ApiError(res.status, body.message ?? 'Request failed', body);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
