import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventType, HardwareInventoryData, SecurityStateData, SoftwareInventoryData } from '@vgon/shared';
import { EVENTS_QUEUE, EventsService, QueuedEvent } from './events.service';
import { InventoryIngestService } from '../inventory/inventory-ingest.service';
import { SecurityEvaluatorService } from '../inventory/security-evaluator.service';

// Decouples ingestion (fast, just enqueue) from persistence (Agent -> API Gateway -> Queue ->
// Event Workers -> PostgreSQL, per the architecture doc) so a slow/unavailable DB never blocks
// the Agent's HTTP request, and a burst of heartbeats/process events doesn't hammer Postgres directly.
@Processor(EVENTS_QUEUE)
export class EventsProcessor extends WorkerHost {
  private readonly logger = new Logger(EventsProcessor.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly inventoryIngest: InventoryIngestService,
    private readonly securityEvaluator: SecurityEvaluatorService,
  ) {
    super();
  }

  async process(job: Job<QueuedEvent>): Promise<void> {
    const result = await this.eventsService.persist(job.data);
    if (result === 'duplicate') return; // redelivery — side effects already ran the first time

    this.logger.debug(`Stored event ${job.data.eventId} (${job.data.eventType})`);
    await this.applySideEffects(job.data);
  }

  // Phase 5: beyond the raw event row (kept for the timeline/audit trail), some event types also
  // update a fast-read "current state" projection (Device.hardware, InstalledSoftware,
  // SecurityFinding) so the dashboard never has to re-aggregate the full event history.
  private async applySideEffects(event: QueuedEvent): Promise<void> {
    try {
      switch (event.eventType) {
        case EventType.HARDWARE_INVENTORY:
          await this.inventoryIngest.applyHardwareInventory(event.deviceId, event.data as unknown as HardwareInventoryData);
          break;
        case EventType.SOFTWARE_INVENTORY:
          await this.inventoryIngest.applySoftwareInventory(
            event.tenantId,
            event.deviceId,
            event.data as unknown as SoftwareInventoryData,
          );
          break;
        case EventType.SECURITY_STATE:
          await this.securityEvaluator.applySecurityState(
            event.tenantId,
            event.deviceId,
            event.data as unknown as SecurityStateData,
          );
          break;
      }
    } catch (err) {
      // The raw event is already safely stored; a side-effect failure (e.g. a device deleted
      // mid-flight) shouldn't fail the whole job and trigger a retry loop on an unrecoverable case.
      this.logger.error(`Failed to apply side effects for ${event.eventType} (${event.eventId})`, err as Error);
    }
  }
}
