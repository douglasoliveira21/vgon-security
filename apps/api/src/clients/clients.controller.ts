import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Permission } from '@vgon/shared';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('clients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @RequirePermissions(Permission.DEVICES_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.list(user);
  }

  @Post()
  @RequirePermissions(Permission.DEVICES_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClientDto) {
    return this.clientsService.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DEVICES_MANAGE)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.DEVICES_MANAGE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clientsService.remove(user, id);
  }
}
