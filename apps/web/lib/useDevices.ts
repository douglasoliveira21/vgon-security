'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export interface DeviceName {
  id: string;
  hostname: string | null;
}

/** Loads the tenant's devices once so event rows can show a hostname instead of a UUID prefix. */
export function useDevices() {
  const [devices, setDevices] = useState<DeviceName[]>([]);

  useEffect(() => {
    apiFetch<DeviceName[]>('/devices')
      .then(setDevices)
      .catch(() => {
        /* names are cosmetic; rows fall back to the short id */
      });
  }, []);

  const nameOf = (deviceId: string) => devices.find((d) => d.id === deviceId)?.hostname ?? deviceId.slice(0, 8);
  return { devices, nameOf };
}
