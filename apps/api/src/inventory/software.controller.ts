import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Permission } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QuerySoftwareDto } from './dto/query-software.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('software')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SoftwareController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permission.DEVICES_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QuerySoftwareDto) {
    return this.prisma.installedSoftware.findMany({
      where: {
        tenantId: user.tenantId,
        deviceId: query.deviceId,
        name: query.name ? { contains: query.name, mode: 'insensitive' } : undefined,
        removedAt: query.includeRemoved ? undefined : null,
      },
      orderBy: { name: 'asc' },
      take: 500,
    });
  }
}
