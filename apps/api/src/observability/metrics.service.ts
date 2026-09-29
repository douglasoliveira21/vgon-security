import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Section 22 — the exact counters/histograms the spec names, plus Node's own process metrics
 * (CPU, memory, event-loop lag, GC) via prom-client's collectDefaultMetrics for free.
 *
 * Deliberately has ZERO constructor dependencies (no PrismaService, no BullMQ Queue) so it's
 * safe to import into BOTH the main AppModule and the standalone WorkerModule
 * (apps/api/src/worker.module.ts) without the cross-application-context DI trap that bit
 * InventoryModule/AuditModule earlier (see README's Phase 8 section) — a separate
 * NestFactory.createApplicationContext(WorkerModule) never sees anything AppModule registers,
 * even @Global() ones. The two gauges that DO need live DB/queue state (agents_online,
 * queue_depth) live in LiveGaugesService instead, which is only wired into the API's own
 * ObservabilityModule, not the worker.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly eventsReceived = new Counter({
    name: 'events_received_total',
    help: 'Events accepted by POST /events and enqueued for processing',
    registers: [this.registry],
  });

  readonly eventsProcessed = new Counter({
    name: 'events_processed_total',
    help: 'Events successfully persisted by the event worker (including idempotent duplicates)',
    registers: [this.registry],
  });

  readonly eventsFailed = new Counter({
    name: 'events_failed_total',
    help: 'Event-processing jobs that threw and will be retried by BullMQ',
    registers: [this.registry],
  });

  readonly agentHeartbeats = new Counter({
    name: 'agent_heartbeats_total',
    help: 'Heartbeats received via POST /agents/heartbeat',
    registers: [this.registry],
  });

  readonly authenticationFailures = new Counter({
    name: 'authentication_failures_total',
    help: 'Failed web-user login attempts',
    registers: [this.registry],
  });

  readonly apiLatency = new Histogram({
    name: 'api_latency_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
