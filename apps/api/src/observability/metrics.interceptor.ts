import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/**
 * Section 22: structured logging + the `api_latency` metric, both from the same request
 * boundary. One JSON line per request (method, route, status, duration, tenant when known)
 * instead of Nest's default free-text log line — trivially greppable/parseable by any log
 * aggregator without pulling in a full logging framework for what's otherwise a small surface.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const start = process.hrtime.bigint();

    // The route TEMPLATE (e.g. "/devices/:id"), not the raw URL — using the raw URL as a metric
    // label would create a new time series per unique device id and blow up cardinality.
    const routeTemplate = request.route?.path ?? request.path ?? 'unknown';

    const finish = (outcome: 'success' | 'error') => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const status = response.statusCode;

      this.metrics.apiLatency.observe({ method: request.method, route: routeTemplate, status: String(status) }, durationSeconds);

      this.logger.log(
        JSON.stringify({
          method: request.method,
          path: routeTemplate,
          status,
          durationMs: Math.round(durationSeconds * 1000),
          tenantId: request.user?.tenantId ?? request.device?.tenantId,
          outcome,
        }),
      );
    };

    return next.handle().pipe(
      tap({
        next: () => finish('success'),
        error: () => finish('error'),
      }),
    );
  }
}
