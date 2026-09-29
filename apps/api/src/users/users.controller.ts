import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Permission } from '@vgon/shared';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(Permission.USERS_MANAGE)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.list(user);
  }

  @Post()
  @RequirePermissions(Permission.USERS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user, dto);
  }

  @Patch(':id/activate')
  @RequirePermissions(Permission.USERS_MANAGE)
  activate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.setActive(user, id, true);
  }

  @Patch(':id/deactivate')
  @RequirePermissions(Permission.USERS_MANAGE)
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.setActive(user, id, false);
  }
}
