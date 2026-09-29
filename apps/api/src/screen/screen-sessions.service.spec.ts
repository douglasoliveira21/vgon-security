import { NotFoundException } from '@nestjs/common';
import { RemoteActionStatus, RemoteActionType } from '@vgon/shared';
import { MAX_SESSION_DURATION_SECONDS, ScreenSessionsService } from './screen-sessions.service';

function makeMulti() {
  const multi = { incr: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) };
  return multi;
}

function makeDeps() {
  const prisma = {
    device: { findFirst: jest.fn() },
    remoteAction: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const redisClient = {
    hset: jest.fn(),
    expire: jest.fn(),
    hgetall: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    multi: jest.fn(() => makeMulti()),
    del: jest.fn(),
  };
  const redis = { client: redisClient, publish: jest.fn(), subscribe: jest.fn() };
  const service = new ScreenSessionsService(prisma as any, audit as any, redis as any);
  return { service, prisma, audit, redis, redisClient };
}

describe('ScreenSessionsService', () => {
  it('start() creates a START_SCREEN_VIEW action and records a Redis meta hash, then audits it', async () => {
    const { service, prisma, redisClient, audit } = makeDeps();
    prisma.device.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.remoteAction.create.mockResolvedValue({ id: 'action-1' });

    const result = await service.start('user-1', 'owner@acme.test', 'tenant-1', 'd1', '1.2.3.4');

    expect(prisma.remoteAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: RemoteActionType.START_SCREEN_VIEW, deviceId: 'd1' }) }),
    );
    expect(redisClient.hset).toHaveBeenCalledWith('screen:action-1:meta', expect.objectContaining({ tenantId: 'tenant-1' }));
    expect(redisClient.expire).toHaveBeenCalledWith('screen:action-1:meta', expect.any(Number));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'device.screen_view.started' }));
    expect(result).toEqual({ sessionId: 'action-1', maxDurationSeconds: MAX_SESSION_DURATION_SECONDS });
  });

  it('start() rejects a device that does not belong to the tenant', async () => {
    const { service, prisma } = makeDeps();
    prisma.device.findFirst.mockResolvedValue(null);

    await expect(service.start('user-1', undefined, 'tenant-1', 'nope', undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stop() on a PENDING (never-started) session completes it directly instead of setting a Redis flag', async () => {
    const { service, prisma, redisClient } = makeDeps();
    prisma.remoteAction.findFirst.mockResolvedValue({ id: 's1', status: RemoteActionStatus.PENDING });

    await service.stop('user-1', undefined, 'tenant-1', 'd1', 's1', undefined);

    expect(prisma.remoteAction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: RemoteActionStatus.COMPLETED }) }),
    );
    expect(redisClient.set).not.toHaveBeenCalled();
    expect(redisClient.del).toHaveBeenCalled(); // cleanupKeys still runs even though nothing was ever set
  });

  it('stop() on an already-ACKNOWLEDGED session sets the Redis stop flag instead', async () => {
    const { service, prisma, redisClient } = makeDeps();
    prisma.remoteAction.findFirst.mockResolvedValue({ id: 's1', status: RemoteActionStatus.ACKNOWLEDGED });

    await service.stop('user-1', undefined, 'tenant-1', 'd1', 's1', undefined);

    expect(redisClient.set).toHaveBeenCalledWith('screen:s1:stop', '1', 'EX', expect.any(Number));
    expect(prisma.remoteAction.update).not.toHaveBeenCalled();
  });

  it('acceptFrame() publishes the frame and says continue=true for a healthy, in-progress session', async () => {
    const { service, prisma, redis, redisClient } = makeDeps();
    prisma.remoteAction.findFirst.mockResolvedValue({ id: 's1', status: RemoteActionStatus.ACKNOWLEDGED });
    redisClient.hgetall.mockResolvedValue({ startedAt: new Date().toISOString() });

    const result = await service.acceptFrame('tenant-1', 'd1', 's1', Buffer.from('jpeg-bytes'));

    expect(result).toEqual({ continue: true });
    expect(redis.publish).toHaveBeenCalledWith('screen:s1:stream', Buffer.from('jpeg-bytes'));
  });

  it('acceptFrame() says continue=false once the max session duration has elapsed', async () => {
    const { service, prisma, redisClient } = makeDeps();
    prisma.remoteAction.findFirst.mockResolvedValue({ id: 's1', status: RemoteActionStatus.ACKNOWLEDGED });
    const longAgo = new Date(Date.now() - (MAX_SESSION_DURATION_SECONDS + 60) * 1000).toISOString();
    redisClient.hgetall.mockResolvedValue({ startedAt: longAgo });

    await expect(service.acceptFrame('tenant-1', 'd1', 's1', Buffer.from('x'))).resolves.toEqual({ continue: false });
  });

  it('acceptFrame() says continue=false once a stop has been requested', async () => {
    const { service, prisma, redisClient } = makeDeps();
    prisma.remoteAction.findFirst.mockResolvedValue({ id: 's1', status: RemoteActionStatus.ACKNOWLEDGED });
    redisClient.hgetall.mockResolvedValue({ startedAt: new Date().toISOString() });
    redisClient.get.mockResolvedValue('1');

    await expect(service.acceptFrame('tenant-1', 'd1', 's1', Buffer.from('x'))).resolves.toEqual({ continue: false });
  });

  it('acceptFrame() says continue=false once the action already completed (agent should stop even if it missed the earlier signal)', async () => {
    const { service, prisma } = makeDeps();
    prisma.remoteAction.findFirst.mockResolvedValue({ id: 's1', status: RemoteActionStatus.COMPLETED });

    await expect(service.acceptFrame('tenant-1', 'd1', 's1', Buffer.from('x'))).resolves.toEqual({ continue: false });
  });

  it('acceptFrame() rejects a frame for a session that does not belong to this tenant/device', async () => {
    const { service, prisma } = makeDeps();
    prisma.remoteAction.findFirst.mockResolvedValue(null);

    await expect(service.acceptFrame('tenant-1', 'd1', 'nope', Buffer.from('x'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('onSessionEnded() publishes an empty end-of-session sentinel and clears the Redis keys', async () => {
    const { service, redis, redisClient } = makeDeps();

    await service.onSessionEnded('s1');

    expect(redis.publish).toHaveBeenCalledWith('screen:s1:stream', Buffer.alloc(0));
    expect(redisClient.del).toHaveBeenCalledWith('screen:s1:meta', 'screen:s1:stop', 'screen:s1:frames');
  });
});
