import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { Permission } from '@vgon/shared';
import { EventsService } from './events.service';
import { IngestEventsDto } from './dto/ingest-events.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { AgentAuthGuard } from '../common/guards/agent-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentDevice, AuthenticatedDevice } from '../common/decorators/current-device.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // --- Agent (device) endpoint ---
  @UseGuards(AgentAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post()
  ingest(@CurrentDevice() device: AuthenticatedDevice, @Body() dto: IngestEventsDto) {
    return this.eventsService.ingest(device, dto.events);
  }

  // --- Web-user (dashboard) endpoint ---
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.EVENTS_READ)
  @Get()
  timeline(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryEventsDto) {
    return this.eventsService.timeline(user.tenantId, query);
  }
}
