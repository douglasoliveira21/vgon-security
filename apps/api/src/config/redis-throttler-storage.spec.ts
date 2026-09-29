import { RedisThrottlerStorage } from './redis-throttler-storage';

// Minimal fake covering only the ioredis surface RedisThrottlerStorage actually calls —
// an in-memory map with millisecond expiries, enough to exercise the real increment/block logic.
class FakeRedis {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  async pttl(key: string): Promise<number> {
    if (this.isExpired(key)) return -2;
    const entry = this.store.get(key)!;
    return entry.expiresAt === null ? -1 : entry.expiresAt - Date.now();
  }

  async incr(key: string): Promise<number> {
    const current = this.isExpired(key) ? 0 : Number(this.store.get(key)!.value);
    const next = current + 1;
    const existing = this.isExpired(key) ? null : this.store.get(key);
    this.store.set(key, { value: String(next), expiresAt: existing?.expiresAt ?? null });
    return next;
  }

  async pexpire(key: string, ms: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + ms;
    return 1;
  }

  async set(key: string, value: string, _mode: string, ttlMs: number): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return 'OK';
  }
}

describe('RedisThrottlerStorage', () => {
  function makeStorage() {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorage(redis as any);
    return { redis, storage };
  }

  it('allows requests up to the limit', async () => {
    const { storage } = makeStorage();

    const first = await storage.increment('client-a', 60_000, 3, 0, 'default');
    const second = await storage.increment('client-a', 60_000, 3, 0, 'default');
    const third = await storage.increment('client-a', 60_000, 3, 0, 'default');

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(third.totalHits).toBe(3);
    expect(third.isBlocked).toBe(false);
  });

  it('blocks once the limit is exceeded, with a block TTL', async () => {
    const { storage } = makeStorage();

    for (let i = 0; i < 3; i++) {
      await storage.increment('client-b', 60_000, 3, 30_000, 'default');
    }
    const fourth = await storage.increment('client-b', 60_000, 3, 30_000, 'default');

    expect(fourth.isBlocked).toBe(true);
    expect(fourth.timeToBlockExpire).toBeGreaterThan(0);
  });

  it('a blocked key stays blocked on subsequent calls without incrementing further', async () => {
    const { storage } = makeStorage();
    for (let i = 0; i < 4; i++) {
      await storage.increment('client-c', 60_000, 3, 30_000, 'default');
    }

    const afterBlocked = await storage.increment('client-c', 60_000, 3, 30_000, 'default');

    expect(afterBlocked.isBlocked).toBe(true);
  });

  it('different keys are tracked independently', async () => {
    const { storage } = makeStorage();

    await storage.increment('client-x', 60_000, 5, 0, 'default');
    await storage.increment('client-x', 60_000, 5, 0, 'default');
    const yResult = await storage.increment('client-y', 60_000, 5, 0, 'default');

    expect(yResult.totalHits).toBe(1);
  });

  it('different throttler names for the same client key do not share a counter', async () => {
    const { storage } = makeStorage();

    await storage.increment('shared-client', 60_000, 5, 0, 'login');
    const registerResult = await storage.increment('shared-client', 60_000, 5, 0, 'register');

    expect(registerResult.totalHits).toBe(1);
  });
});
