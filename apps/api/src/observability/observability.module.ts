import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { MetricsModule } from './metrics.module';
import { MetricsController } from './metrics.controller';
import { LiveGaugesService } from './live-gauges.service';
import { MetricsInterceptor } from './metrics.interceptor';
import { EVENTS_QUEUE } from '../events/events.service';

// API-only: pulls in the live gauges (need PrismaService + the BullMQ Queue) and the /metrics
// HTTP endpoint on top of MetricsModule's bare counters. Not imported by WorkerModule.
@Module({
  imports: [MetricsModule, BullModule.registerQueue({ name: EVENTS_QUEUE })],
  controllers: [MetricsController],
  providers: [LiveGaugesService, { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
  exports: [MetricsModule],
})
export class ObservabilityModule {}
