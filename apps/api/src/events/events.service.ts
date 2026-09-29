import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { EventSeverity } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedDevice } from '../common/decorators/current-device.decorator';
import { EventEnvelopeDto } from './dto/ingest-events.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { MetricsService } from '../observability/metrics.service';

export const EVENTS_QUEUE = 'events';

// Internal shape pushed through the queue: the Agent's envelope plus the tenant/device
// identity taken from the authenticated JWT, never from the envelope body itself.
export interface QueuedEvent extends EventEnvelopeDto {
  tenantId: string;
  deviceId: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EVENTS_QUEUE) private readonly queue: Queue<QueuedEvent>,
    private readonly metrics: MetricsService,
  ) {}

  async ingest(device: AuthenticatedDevice, envelopes: EventEnvelopeDto[]) {
    this.metrics.eventsReceived.inc(envelopes.length);

    await this.queue.addBulk(
      envelopes.map((envelope) => ({
        name: 'ingest',
        data: { ...envelope, tenantId: device.tenantId, deviceId: device.deviceId },
        opts: {
          // BullMQ-level dedup for redeliveries still sitting in the queue; the Postgres
          // unique constraint on eventId is the authoritative idempotency guarantee (below).
          jobId: envelope.eventId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      })),
    );

    return { accepted: envelopes.length };
  }

  // Called by EventsProcessor (BullMQ worker). Kept here so it's unit-testable without a queue.
  async persist(event: QueuedEvent): Promise<'created' | 'duplicate'> {
    try {
      await this.prisma.event.create({
        data: {
          eventId: event.eventId,
          tenantId: event.tenantId,
          deviceId: event.deviceId,
          userId: event.userId,
          agentVersion: event.agentVersion,
          eventType: event.eventType,
          severity: event.severity as EventSeverity,
          schemaVersion: event.schemaVersion,
          occurredAt: new Date(event.timestamp),
          data: event.data as Prisma.InputJsonValue,
        },
      });
      return 'created';
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Same eventId already stored — the Agent retried a batch it wasn't sure landed.
        this.logger.debug(`Duplicate event ignored: ${event.eventId}`);
        return 'duplicate';
      }
      throw err;
    }
  }

  async timeline(tenantId: string, query: QueryEventsDto) {
    return this.prisma.event.findMany({
      where: {
        tenantId, // always from the authenticated user, never from the query string
        deviceId: query.deviceId,
        eventType: query.eventType,
        occurredAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: query.take ?? 100,
    });
  }
}
