import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Permission } from '@vgon/shared';
import { ReportsService } from './reports.service';
import { QueryTimeseriesDto } from './dto/query-timeseries.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.REPORTS_READ)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.overview(user.tenantId);
  }

  @Get('events-timeseries')
  eventsTimeseries(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryTimeseriesDto) {
    return this.reports.eventsTimeseries(user.tenantId, query.days);
  }

  @Get('top-event-types')
  topEventTypes(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryTimeseriesDto) {
    return this.reports.topEventTypes(user.tenantId, query.days);
  }

  @Get('top-domains')
  topDomains(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryTimeseriesDto) {
    return this.reports.topDomains(user.tenantId, query.days);
  }
}
