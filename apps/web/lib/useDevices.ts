'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useClientFilter } from '@/lib/ClientFilter';

export interface DeviceName {
  id: string;
  hostname: string | null;
  loggedInUser: string | null;
}

/** Loads the tenant's devices (respecting the dashboard's global client filter) so event rows
 * can show a hostname instead of a UUID prefix, and device pickers only list relevant devices. */
export function useDevices() {
  const { clientId } = useClientFilter();
  const [devices, setDevices] = useState<DeviceName[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (clientId) params.set('clientId', clientId);
    apiFetch<DeviceName[]>(`/devices?${params}`)
      .then(setDevices)
      .catch(() => {
        /* names are cosmetic; rows fall back to the short id */
      });
  }, [clientId]);

  const nameOf = (deviceId: string) => devices.find((d) => d.id === deviceId)?.hostname ?? deviceId.slice(0, 8);
  const userOf = (deviceId: string) => devices.find((d) => d.id === deviceId)?.loggedInUser ?? null;
  return { devices, nameOf, userOf };
}
