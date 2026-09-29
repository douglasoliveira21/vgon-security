import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Gauge } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';
import { EVENTS_QUEUE } from '../events/events.service';
import { MetricsService } from './metrics.service';

const ONLINE_THRESHOLD_MS = 5 * 60_000; // matches devices.util.ts's ONLINE cutoff

/**
 * `agents_online` and `queue_depth` (section 22) are current-state gauges, not cumulative
 * counters — recomputed on every scrape rather than tracked incrementally. Needs PrismaService
 * and the BullMQ Queue, so — unlike MetricsService's plain counters — this only makes sense
 * wired into the API app (ObservabilityModule), never the standalone worker.
 */
@Injectable()
export class LiveGaugesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EVENTS_QUEUE) private readonly queue: Queue,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit() {
    const prisma = this.prisma;
    const queue = this.queue;

    // prom-client's Registry.metrics() awaits each collector's `collect()` before rendering, so
    // setting the value inside `collect` (rather than polling on a timer) keeps every scrape
    // exact-at-scrape-time. `collect` must be supplied in the constructor (it isn't a settable
    // instance property), and is invoked with `this` bound to the Gauge instance itself.
    new Gauge({
      name: 'agents_online',
      help: 'Devices with a heartbeat in the last 5 minutes',
      registers: [this.metrics.registry],
      async collect() {
        const count = await prisma.device.count({
          where: { lastSeenAt: { gte: new Date(Date.now() - ONLINE_THRESHOLD_MS) } },
        });
        this.set(count);
      },
    });

    new Gauge({
      name: 'queue_depth',
      help: 'Events waiting or actively being processed by the event worker',
      registers: [this.metrics.registry],
      async collect() {
        const [waiting, active] = await Promise.all([queue.getWaitingCount(), queue.getActiveCount()]);
        this.set(waiting + active);
      },
    });
  }
}
