import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsProcessor } from './events.processor';
import { EVENTS_QUEUE } from './events.service';
import { InventoryModule } from '../inventory/inventory.module';
import { MetricsModule } from '../observability/metrics.module';

@Module({
  imports: [BullModule.registerQueue({ name: EVENTS_QUEUE }), InventoryModule, MetricsModule],
  controllers: [EventsController],
  providers: [EventsService, EventsProcessor],
  exports: [EventsService],
})
export class EventsModule {}
