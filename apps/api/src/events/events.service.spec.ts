import { Prisma } from '@prisma/client';
import { EventSeverity } from '@vgon/shared';
import { EventsService, QueuedEvent } from './events.service';

function duplicateKeyError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function makeEvent(overrides: Partial<QueuedEvent> = {}): QueuedEvent {
  return {
    eventId: '11111111-1111-1111-1111-111111111111',
    tenantId: 'tenant-1',
    deviceId: 'device-1',
    agentVersion: '0.1.0',
    timestamp: new Date().toISOString(),
    eventType: 'process.started',
    severity: EventSeverity.INFO,
    schemaVersion: 1,
    data: { pid: 123, processName: 'notepad.exe' },
    ...overrides,
  };
}

describe('EventsService.persist', () => {
  it('stores a new event and reports "created"', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { event: { create } } as any;
    const service = new EventsService(prisma, {} as any);

    const result = await service.persist(makeEvent());

    expect(result).toBe('created');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('treats a duplicate eventId (redelivered batch) as idempotent, not an error', async () => {
    const create = jest.fn().mockRejectedValue(duplicateKeyError());
    const prisma = { event: { create } } as any;
    const service = new EventsService(prisma, {} as any);

    const result = await service.persist(makeEvent());

    expect(result).toBe('duplicate');
  });

  it('rethrows any other database error instead of swallowing it', async () => {
    const create = jest.fn().mockRejectedValue(new Error('connection lost'));
    const prisma = { event: { create } } as any;
    const service = new EventsService(prisma, {} as any);

    await expect(service.persist(makeEvent())).rejects.toThrow('connection lost');
  });
});
