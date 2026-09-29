import { Injectable } from '@nestjs/common';
import { EffectivePolicy, PolicyScope } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyRow, resolveEffectivePolicy } from './policy-resolver';

@Injectable()
export class PolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForDevice(tenantId: string, deviceId: string): Promise<EffectivePolicy> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true, siteId: true, groupId: true },
    });

    // Device not found (shouldn't happen — caller already authenticated as this device) or has
    // no site/group yet: TENANT-scope rows still apply, so resolve with whatever scope ids exist.
    const scopeIds: Partial<Record<PolicyScope, string | null>> = {
      [PolicyScope.DEVICE]: deviceId,
      [PolicyScope.GROUP]: device?.groupId ?? null,
      [PolicyScope.SITE]: device?.siteId ?? null,
    };

    const rows = await this.prisma.policy.findMany({
      where: {
        tenantId,
        OR: [
          { scope: PolicyScope.TENANT, scopeId: '' }, // TENANT rows are stored with scopeId '' (see PoliciesController.upsert)
          scopeIds[PolicyScope.SITE] ? { scope: PolicyScope.SITE, scopeId: scopeIds[PolicyScope.SITE]! } : undefined,
          scopeIds[PolicyScope.GROUP] ? { scope: PolicyScope.GROUP, scopeId: scopeIds[PolicyScope.GROUP]! } : undefined,
          { scope: PolicyScope.DEVICE, scopeId: deviceId },
        ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined),
      },
    });

    const policyRows: PolicyRow[] = rows.map((r) => ({
      scope: r.scope as PolicyScope,
      type: r.type as any,
      settings: r.settings as Record<string, unknown>,
      updatedAt: r.updatedAt,
    }));

    return resolveEffectivePolicy(policyRows);
  }
}
