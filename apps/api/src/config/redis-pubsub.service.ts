import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { parseRedisConnection } from './redis-connection';

/**
 * Thin wrapper around ioredis pub/sub, used to relay live screen-view frames between API replicas
 * (the Agent's frame POST and the dashboard's stream GET can land on different replicas behind a
 * load balancer — see ScreenSessionsService). One shared connection publishes; each `subscribe`
 * call gets its own duplicated connection, since ioredis dedicates a subscriber connection to
 * pub/sub mode exclusively.
 */
@Injectable()
export class RedisPubSubService implements OnModuleDestroy {
  private readonly publisher = new Redis({ ...parseRedisConnection(), maxRetriesPerRequest: null });

  /** Also used for small ephemeral keys (session metadata, stop flags, frame counters). */
  get client(): Redis {
    return this.publisher;
  }

  publish(channel: string, payload: Buffer): Promise<number> {
    return this.publisher.publish(channel, payload);
  }

  /**
   * Subscribes to a channel and invokes `onMessage` for every binary payload published to it.
   * Returns a cleanup function that unsubscribes and closes the dedicated connection — callers
   * MUST call it (e.g. on HTTP response close) or the subscriber connection leaks.
   */
  subscribe(channel: string, onMessage: (payload: Buffer) => void): () => void {
    const subscriber = this.publisher.duplicate();
    const listener = (chan: Buffer, message: Buffer) => {
      if (chan.toString() === channel) onMessage(message);
    };
    subscriber.on('messageBuffer', listener);
    // Fire-and-forget: subscribe() can reject on connection issues, but there's no meaningful
    // synchronous caller action here — the stream simply stays empty until it (re)connects.
    void subscriber.subscribe(channel).catch(() => undefined);

    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      subscriber.off('messageBuffer', listener);
      subscriber.disconnect();
    };
  }

  onModuleDestroy() {
    this.publisher.disconnect();
  }
}
