import { Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FindingStatus, Permission } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueryFindingsDto } from './dto/query-findings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { deviceClientScopeWhere } from '../common/client-scope.util';

@Controller('security/findings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SecurityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(Permission.SECURITY_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryFindingsDto) {
    return this.prisma.securityFinding.findMany({
      where: {
        tenantId: user.tenantId,
        deviceId: query.deviceId,
        status: query.status,
        severity: query.severity,
        ...deviceClientScopeWhere(user, query.clientId),
      },
      orderBy: [{ status: 'asc' }, { detectedAt: 'desc' }],
      take: 500,
    });
  }

  // Manual override — e.g. an admin accepted the risk, or fixed it out-of-band before the next
  // security.state report would have auto-resolved it.
  @Post(':id/resolve')
  @RequirePermissions(Permission.SECURITY_MANAGE)
  async resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const existing = await this.prisma.securityFinding.findFirst({
      where: { id, tenantId: user.tenantId, ...deviceClientScopeWhere(user) },
    });
    if (!existing) throw new NotFoundException('Finding not found');

    const finding = await this.prisma.securityFinding.update({
      where: { id },
      data: { status: FindingStatus.RESOLVED, resolvedAt: new Date() },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorEmail: user.email,
      action: 'security.finding.resolved',
      resource: `security_finding:${id}`,
      result: 'SUCCESS',
      metadata: { code: existing.code, deviceId: existing.deviceId },
    });

    return finding;
  }
}
