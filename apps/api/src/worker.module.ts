import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { InventoryModule } from './inventory/inventory.module';
import { EventsService, EVENTS_QUEUE } from './events/events.service';
import { EventsProcessor } from './events/events.processor';
import { parseRedisConnection } from './config/redis-connection';

/**
 * Phase 8: "escalabilidade horizontal". Everything the standalone event worker needs — and
 * nothing else. Deliberately does NOT import AppModule (no HTTP controllers, no Passport/JWT
 * strategies, no ThrottlerModule) so `main-worker.ts` starts a lean process that only consumes
 * the BullMQ queue and persists events — scale this independently from the HTTP API by running
 * N instances of `node dist/main-worker.js` without touching the API's own replica count.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({ connection: parseRedisConnection() }),
    BullModule.registerQueue({ name: EVENTS_QUEUE }),
    PrismaModule,
    InventoryModule,
  ],
  providers: [EventsService, EventsProcessor],
})
export class WorkerModule {}
