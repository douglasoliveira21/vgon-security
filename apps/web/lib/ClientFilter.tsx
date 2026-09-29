'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, getSessionUser } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const STORAGE_KEY = 'vgon_client_filter';

export interface ClientOption {
  id: string;
  name: string;
}

interface ClientFilterValue {
  /** null = "all clients". Ignored dashboard-wide once the signed-in user is themselves
   * scoped to one client (see SessionUser.clientId) — there's nothing left to filter. */
  clientId: string | null;
  setClientId: (id: string | null) => void;
  clients: ClientOption[];
  /** True once the signed-in user has their own fixed client scope — the picker is hidden. */
  locked: boolean;
}

const ClientFilterContext = createContext<ClientFilterValue | null>(null);

export function ClientFilterProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientIdState] = useState<string | null>(null);
  const locked = Boolean(getSessionUser()?.clientId);

  useEffect(() => {
    if (locked) return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setClientIdState(stored);
    } catch {
      /* localStorage unavailable — filter just starts unset */
    }
    apiFetch<ClientOption[]>('/clients')
      .then(setClients)
      .catch(() => setClients([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setClientId(id: string | null) {
    setClientIdState(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* per-viewer convenience only — fine if it doesn't persist */
    }
  }

  return (
    <ClientFilterContext.Provider value={{ clientId: locked ? null : clientId, setClientId, clients, locked }}>
      {children}
    </ClientFilterContext.Provider>
  );
}

export function useClientFilter(): ClientFilterValue {
  const ctx = useContext(ClientFilterContext);
  if (!ctx) throw new Error('useClientFilter must be used within ClientFilterProvider');
  return ctx;
}

/** Appends `clientId` (only when the global filter has one selected) to a query string builder. */
export function withClientFilter(params: URLSearchParams, clientId: string | null): URLSearchParams {
  if (clientId) params.set('clientId', clientId);
  return params;
}

export function ClientFilterSelect() {
  const { t } = useI18n();
  const { clientId, setClientId, clients, locked } = useClientFilter();

  if (locked || clients.length === 0) return null;

  return (
    <select
      value={clientId ?? ''}
      onChange={(e) => setClientId(e.target.value || null)}
      className="input w-auto py-1.5 text-xs"
      aria-label={t('clients.title')}
    >
      <option value="">{t('clients.allClients')}</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
