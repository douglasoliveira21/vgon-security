import { Module } from '@nestjs/common';
import { HardwareController } from './hardware.controller';
import { SoftwareController } from './software.controller';
import { SecurityController } from './security.controller';
import { InventoryIngestService } from './inventory-ingest.service';
import { SecurityEvaluatorService } from './security-evaluator.service';
import { AuditModule } from '../audit/audit.module';

// AuditModule is imported explicitly even though it's marked @Global() in AppModule — a global
// module's exports are only ambient within the application context that imported it. WorkerModule
// (apps/api/src/worker.module.ts) pulls in InventoryModule for the two services EventsProcessor
// needs but is a SEPARATE application context that never imports AuditModule itself, so
// SecurityController's AuditService dependency would fail to resolve there without this.
@Module({
  imports: [AuditModule],
  controllers: [HardwareController, SoftwareController, SecurityController],
  providers: [InventoryIngestService, SecurityEvaluatorService],
  exports: [InventoryIngestService, SecurityEvaluatorService],
})
export class InventoryModule {}
