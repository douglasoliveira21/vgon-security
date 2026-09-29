import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { ClientsModule } from './clients/clients.module';
import { SitesModule } from './sites/sites.module';
import { GroupsModule } from './groups/groups.module';
import { AgentsModule } from './agents/agents.module';
import { EventsModule } from './events/events.module';
import { InventoryModule } from './inventory/inventory.module';
import { PoliciesModule } from './policies/policies.module';
import { RmmModule } from './rmm/rmm.module';
import { ScreenModule } from './screen/screen.module';
import { ReportsModule } from './reports/reports.module';
import { HealthModule } from './health/health.module';
import { ObservabilityModule } from './observability/observability.module';
import { parseRedisConnection } from './config/redis-connection';
import { RedisThrottlerStorage } from './config/redis-throttler-storage';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Redis-backed so the rate limit is correct across horizontally-scaled API replicas — see
    // RedisThrottlerStorage for why the default in-memory storage silently multiplies the
    // effective limit by replica count.
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new RedisThrottlerStorage(new Redis({ ...parseRedisConnection(), maxRetriesPerRequest: null })),
      }),
    }),
    BullModule.forRoot({ connection: parseRedisConnection() }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DevicesModule,
    ClientsModule,
    SitesModule,
    GroupsModule,
    AgentsModule,
    EventsModule,
    InventoryModule,
    PoliciesModule,
    RmmModule,
    ScreenModule,
    ReportsModule,
    HealthModule,
    ObservabilityModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
