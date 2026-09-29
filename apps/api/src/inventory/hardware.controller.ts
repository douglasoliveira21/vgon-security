import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Permission } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('hardware')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HardwareController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permission.DEVICES_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query('deviceId') deviceId?: string) {
    return this.prisma.device.findMany({
      where: { tenantId: user.tenantId, id: deviceId }, // tenantId always from the JWT
      select: { id: true, hostname: true, hardware: true, lastInventoryAt: true },
      orderBy: { hostname: 'asc' },
    });
  }
}
