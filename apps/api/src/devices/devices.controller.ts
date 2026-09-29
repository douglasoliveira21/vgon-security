import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Permission } from '@vgon/shared';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('devices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @RequirePermissions(Permission.DEVICES_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.list(user.tenantId);
  }

  @Get(':id')
  @RequirePermissions(Permission.DEVICES_READ)
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.devicesService.get(user.tenantId, id);
  }

  @Post(':id/revoke')
  @RequirePermissions(Permission.DEVICES_MANAGE)
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.devicesService.revoke(user, id);
  }
}
