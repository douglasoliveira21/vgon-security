import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Permission } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Controller('audit')
@UseGuards(PermissionsGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_READ)
  async list(@CurrentUser() user: AuthenticatedUser, @Query('take') take = '50') {
    return this.prisma.auditLog.findMany({
      where: { tenantId: user.tenantId }, // tenant always derived from the authenticated JWT, never from query params
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 50, 200),
    });
  }
}
