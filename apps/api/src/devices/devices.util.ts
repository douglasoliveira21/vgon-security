import { DeviceStatus } from '@vgon/shared';

const STALE_AFTER_MS = 5 * 60_000; // no heartbeat for 5 minutes -> STALE
const OFFLINE_AFTER_MS = 20 * 60_000; // no heartbeat for 20 minutes -> OFFLINE

// Derives a live status from lastSeenAt rather than trusting a persisted value,
// since the Agent has no way to push "I went offline" (section 15).
export function computeLiveStatus(lastSeenAt: Date | null, persisted: DeviceStatus): DeviceStatus {
  if (persisted === DeviceStatus.BLOCKED || persisted === DeviceStatus.DECOMMISSIONED) {
    return persisted;
  }
  if (!lastSeenAt) return DeviceStatus.PENDING;

  const ageMs = Date.now() - lastSeenAt.getTime();
  if (ageMs > OFFLINE_AFTER_MS) return DeviceStatus.OFFLINE;
  if (ageMs > STALE_AFTER_MS) return DeviceStatus.STALE;
  return DeviceStatus.ONLINE;
}
