import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';

// The counters-only half — no PrismaService/Queue dependency — safe to import into both
// AppModule and the standalone WorkerModule. See MetricsService's own doc comment for why that
// distinction matters here.
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
