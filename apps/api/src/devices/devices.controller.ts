import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permission } from '@vgon/shared';
import { DevicesService } from './devices.service';
import { UpdateDeviceDto } from './dto/update-device.dto';
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
  list(@CurrentUser() user: AuthenticatedUser, @Query('clientId') clientId?: string) {
    return this.devicesService.list(user, clientId);
  }

  @Get(':id')
  @RequirePermissions(Permission.DEVICES_READ)
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.devicesService.get(user, id);
  }

  @Post(':id/revoke')
  @RequirePermissions(Permission.DEVICES_MANAGE)
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.devicesService.revoke(user, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DEVICES_MANAGE)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devicesService.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.DEVICES_MANAGE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.devicesService.remove(user, id);
  }
}
