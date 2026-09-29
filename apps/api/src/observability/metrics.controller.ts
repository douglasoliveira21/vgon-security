import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { Public } from '../common/decorators/public.decorator';

// Prometheus scrapes this directly — no auth, same as most /metrics conventions (it carries no
// tenant data, only aggregate operational counters). Put it behind a network policy / reverse-proxy
// allowlist in production if it shouldn't be internet-reachable.
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async get(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
