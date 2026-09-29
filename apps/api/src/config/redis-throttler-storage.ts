import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type { Redis } from 'ioredis';

/**
 * Section 8/Phase 8: "escalabilidade horizontal". The default in-memory ThrottlerStorage keeps
 * hit counters in process memory — with N horizontally-scaled API replicas behind a load
 * balancer, each replica enforces its own separate limit, so the *effective* rate limit becomes
 * N times what was configured (and login/registration brute-force protection weakens the same
 * way). Backing the counters with Redis (already a hard dependency for the BullMQ queue) makes
 * the limit correct regardless of replica count.
 *
 * Fixed-window counter via INCR+PEXPIRE — same semantics `ttl`/`blockDuration` already imply
 * (both are milliseconds, matching @nestjs/throttler's own in-memory implementation).
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttle:{${throttlerName}}:${key}`;
    const blockKey = `throttle:{${throttlerName}}:${key}:blocked`;

    const blockPttl = await this.redis.pttl(blockKey);
    if (blockPttl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockPttl / 1000),
      };
    }

    const totalHits = await this.redis.incr(hitKey);
    if (totalHits === 1) {
      await this.redis.pexpire(hitKey, ttl);
    }

    const hitPttl = await this.redis.pttl(hitKey);
    const timeToExpire = Math.ceil(Math.max(hitPttl, 0) / 1000);

    let isBlocked = false;
    let timeToBlockExpire = 0;
    if (totalHits > limit && blockDuration > 0) {
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
      isBlocked = true;
      timeToBlockExpire = Math.ceil(blockDuration / 1000);
    }

    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
  }
}
