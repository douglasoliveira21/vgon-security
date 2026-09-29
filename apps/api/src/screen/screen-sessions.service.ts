import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RemoteActionStatus, RemoteActionType } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisPubSubService } from '../config/redis-pubsub.service';

// Enforced independently on both sides (defense in depth): the Agent's own AgentOptions carries
// the same default and stops the capture helper on its own timer regardless of what the API says,
// so a bug in either half alone can't turn this into an unbounded session.
export const MAX_SESSION_DURATION_SECONDS = 15 * 60;
const KEY_TTL_SECONDS = MAX_SESSION_DURATION_SECONDS + 120;

const metaKey = (id: string) => `screen:${id}:meta`;
const stopKey = (id: string) => `screen:${id}:stop`;
const framesKey = (id: string) => `screen:${id}:frames`;
const channel = (id: string) => `screen:${id}:stream`;

@Injectable()
export class ScreenSessionsService {
  private readonly logger = new Logger(ScreenSessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisPubSubService,
  ) {}

  /** Web-user: request a new live view session for a device. Actually starting it is up to the
   * Agent's normal remote-action poll (same up-to-~30s latency as every other remote action). */
  async start(actorId: string, actorEmail: string | undefined, tenantId: string, deviceId: string, ip?: string) {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, tenantId } });
    if (!device) throw new NotFoundException('Device not found');

    const action = await this.prisma.remoteAction.create({
      data: { tenantId, deviceId, type: RemoteActionType.START_SCREEN_VIEW, requestedById: actorId },
    });

    await this.redis.client.hset(metaKey(action.id), {
      tenantId,
      deviceId,
      startedAt: new Date().toISOString(),
    });
    await this.redis.client.expire(metaKey(action.id), KEY_TTL_SECONDS);

    await this.audit.log({
      tenantId,
      actorId,
      actorEmail,
      action: 'device.screen_view.started',
      resource: `device:${deviceId}`,
      result: 'SUCCESS',
      ip,
      metadata: { sessionId: action.id },
    });

    return { sessionId: action.id, maxDurationSeconds: MAX_SESSION_DURATION_SECONDS };
  }

  /** Web-user: ask an active (or not-yet-started) session to stop. */
  async stop(actorId: string, actorEmail: string | undefined, tenantId: string, deviceId: string, sessionId: string, ip?: string) {
    const action = await this.prisma.remoteAction.findFirst({
      where: { id: sessionId, tenantId, deviceId, type: RemoteActionType.START_SCREEN_VIEW },
    });
    if (!action) throw new NotFoundException('Screen session not found');

    if (action.status === RemoteActionStatus.PENDING) {
      // The Agent never picked it up — nothing to signal, just close it out immediately.
      await this.prisma.remoteAction.update({
        where: { id: sessionId },
        data: { status: RemoteActionStatus.COMPLETED, completedAt: new Date(), result: { reason: 'stopped_before_start' } },
      });
      await this.cleanupKeys(sessionId);
    } else {
      await this.redis.client.set(stopKey(sessionId), '1', 'EX', KEY_TTL_SECONDS);
    }

    await this.audit.log({
      tenantId,
      actorId,
      actorEmail,
      action: 'device.screen_view.stop_requested',
      resource: `device:${deviceId}`,
      result: 'SUCCESS',
      ip,
      metadata: { sessionId },
    });
  }

  /** Web-user: authorize + look up a session before opening its stream. */
  async getForStream(tenantId: string, deviceId: string, sessionId: string) {
    const action = await this.prisma.remoteAction.findFirst({
      where: { id: sessionId, tenantId, deviceId, type: RemoteActionType.START_SCREEN_VIEW },
    });
    if (!action) throw new NotFoundException('Screen session not found');
    return action;
  }

  subscribeToFrames(sessionId: string, onFrame: (buf: Buffer) => void): () => void {
    return this.redis.subscribe(channel(sessionId), onFrame);
  }

  /** Agent: validate a frame belongs to an active session, relay it, and decide whether the
   * Agent should keep streaming. Never throws for a normal "please stop" — that's a false return,
   * not an error; it only throws (404) when the session id doesn't belong to this device at all. */
  async acceptFrame(tenantId: string, deviceId: string, sessionId: string, frame: Buffer): Promise<{ continue: boolean }> {
    const action = await this.prisma.remoteAction.findFirst({
      where: { id: sessionId, tenantId, deviceId, type: RemoteActionType.START_SCREEN_VIEW },
    });
    if (!action) throw new NotFoundException('Screen session not found');

    if (action.status === RemoteActionStatus.COMPLETED || action.status === RemoteActionStatus.FAILED) {
      return { continue: false };
    }

    const meta = await this.redis.client.hgetall(metaKey(sessionId));
    const startedAt = meta.startedAt ? new Date(meta.startedAt).getTime() : Date.now();
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (elapsedSeconds >= MAX_SESSION_DURATION_SECONDS) {
      return { continue: false };
    }

    const stopRequested = await this.redis.client.get(stopKey(sessionId));
    if (stopRequested) {
      return { continue: false };
    }

    await this.redis.publish(channel(sessionId), frame);
    await this.redis.client.multi().incr(framesKey(sessionId)).expire(framesKey(sessionId), KEY_TTL_SECONDS).exec();

    return { continue: true };
  }

  async frameCount(sessionId: string): Promise<number> {
    const raw = await this.redis.client.get(framesKey(sessionId));
    return raw ? Number.parseInt(raw, 10) : 0;
  }

  /** Called by RemoteActionsController when a START_SCREEN_VIEW action completes, so any open
   * stream can close gracefully and the ephemeral Redis keys don't wait out their full TTL. */
  async onSessionEnded(sessionId: string): Promise<void> {
    await this.redis.publish(channel(sessionId), Buffer.alloc(0)); // empty frame = end-of-session sentinel
    await this.cleanupKeys(sessionId);
  }

  private async cleanupKeys(sessionId: string): Promise<void> {
    await this.redis.client.del(metaKey(sessionId), stopKey(sessionId), framesKey(sessionId));
  }
}
