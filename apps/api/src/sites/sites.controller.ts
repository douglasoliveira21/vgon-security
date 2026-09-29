import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Permission } from '@vgon/shared';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('sites')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  @RequirePermissions(Permission.DEVICES_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.list(user.tenantId);
  }

  @Post()
  @RequirePermissions(Permission.DEVICES_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSiteDto) {
    return this.sitesService.create(user, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.DEVICES_MANAGE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sitesService.remove(user, id);
  }
}
