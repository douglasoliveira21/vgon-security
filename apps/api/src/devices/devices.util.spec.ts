import { DeviceStatus } from '@vgon/shared';
import { computeLiveStatus } from './devices.util';

describe('computeLiveStatus', () => {
  it('returns PENDING when the device has never checked in', () => {
    expect(computeLiveStatus(null, DeviceStatus.PENDING)).toBe(DeviceStatus.PENDING);
  });

  it('returns ONLINE for a recent heartbeat', () => {
    const lastSeenAt = new Date(Date.now() - 60_000); // 1 minute ago
    expect(computeLiveStatus(lastSeenAt, DeviceStatus.ONLINE)).toBe(DeviceStatus.ONLINE);
  });

  it('returns STALE once the heartbeat is older than 5 minutes', () => {
    const lastSeenAt = new Date(Date.now() - 6 * 60_000);
    expect(computeLiveStatus(lastSeenAt, DeviceStatus.ONLINE)).toBe(DeviceStatus.STALE);
  });

  it('returns OFFLINE once the heartbeat is older than 20 minutes', () => {
    const lastSeenAt = new Date(Date.now() - 25 * 60_000);
    expect(computeLiveStatus(lastSeenAt, DeviceStatus.ONLINE)).toBe(DeviceStatus.OFFLINE);
  });

  it('never overrides an admin-set BLOCKED status, even with a fresh heartbeat', () => {
    const lastSeenAt = new Date();
    expect(computeLiveStatus(lastSeenAt, DeviceStatus.BLOCKED)).toBe(DeviceStatus.BLOCKED);
  });
});
