import { Body, Controller, Delete, Get, NotFoundException, Param, Put, Query, UseGuards } from '@nestjs/common';
import { Permission, PolicyScope } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpsertPolicyDto } from './dto/upsert-policy.dto';
import { QueryPoliciesDto } from './dto/query-policies.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PoliciesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(Permission.POLICIES_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPoliciesDto) {
    return this.prisma.policy.findMany({
      where: { tenantId: user.tenantId, scope: query.scope, type: query.type },
      orderBy: [{ type: 'asc' }, { scope: 'asc' }],
    });
  }

  // Upsert by the natural key (tenant, scope, scopeId, type) — setting the same scope/type
  // again just updates it in place and bumps `version`, it never creates a duplicate override.
  @Put()
  @RequirePermissions(Permission.POLICIES_MANAGE)
  async upsert(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPolicyDto) {
    // Normalized to '' rather than null for TENANT scope: Postgres/Prisma treat NULL as
    // distinct from NULL in a compound unique index, which would let duplicate TENANT-scope
    // rows for the same type slip through (same reasoning as InstalledSoftware.version).
    const scopeId = dto.scope === PolicyScope.TENANT ? '' : dto.scopeId!;

    if (scopeId) {
      await this.assertScopeTargetExists(user.tenantId, dto.scope, scopeId);
    }

    const policy = await this.prisma.policy.upsert({
      where: { tenantId_scope_scopeId_type: { tenantId: user.tenantId, scope: dto.scope, scopeId, type: dto.type } },
      create: {
        tenantId: user.tenantId,
        scope: dto.scope,
        scopeId,
        type: dto.type,
        settings: dto.settings as any,
        createdById: user.userId,
      },
      update: {
        settings: dto.settings as any,
        version: { increment: 1 },
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorEmail: user.email,
      action: 'policy.upserted',
      resource: `policy:${policy.id}`,
      result: 'SUCCESS',
      metadata: { scope: dto.scope, scopeId, type: dto.type },
    });

    return policy;
  }

  @Delete(':id')
  @RequirePermissions(Permission.POLICIES_MANAGE)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const existing = await this.prisma.policy.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundException('Policy not found');

    await this.prisma.policy.delete({ where: { id } });

    await this.audit.log({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorEmail: user.email,
      action: 'policy.deleted',
      resource: `policy:${id}`,
      result: 'SUCCESS',
      metadata: { scope: existing.scope, scopeId: existing.scopeId, type: existing.type },
    });

    return { id, deleted: true };
  }

  // Never let an override be created against a site/group/device from a DIFFERENT tenant.
  private async assertScopeTargetExists(tenantId: string, scope: PolicyScope, scopeId: string) {
    const exists =
      scope === PolicyScope.SITE
        ? await this.prisma.site.findFirst({ where: { id: scopeId, tenantId } })
        : scope === PolicyScope.GROUP
          ? await this.prisma.group.findFirst({ where: { id: scopeId, tenantId } })
          : await this.prisma.device.findFirst({ where: { id: scopeId, tenantId } });

    if (!exists) throw new NotFoundException(`${scope} scope target not found`);
  }
}
