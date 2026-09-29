import { Injectable, Logger } from '@nestjs/common';
import { FindingStatus, SecurityStateData } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateSecurityFindings } from './security-rules';

@Injectable()
export class SecurityEvaluatorService {
  private readonly logger = new Logger(SecurityEvaluatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async applySecurityState(tenantId: string, deviceId: string, data: SecurityStateData): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { securityState: data as any, lastInventoryAt: new Date() },
    });

    const shouldBeOpen = evaluateSecurityFindings(data);
    const openCodes = new Set(shouldBeOpen.map((f) => f.code));

    // Reopen/refresh every finding the current state warrants.
    for (const finding of shouldBeOpen) {
      await this.prisma.securityFinding.upsert({
        where: { deviceId_code: { deviceId, code: finding.code } },
        create: {
          tenantId,
          deviceId,
          code: finding.code,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          status: FindingStatus.OPEN,
        },
        update: {
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          status: FindingStatus.OPEN,
          detectedAt: new Date(),
          resolvedAt: null,
        },
      });
    }

    // Resolve any previously OPEN finding for this device whose condition no longer holds.
    const existingOpen = await this.prisma.securityFinding.findMany({
      where: { deviceId, status: FindingStatus.OPEN },
      select: { id: true, code: true },
    });
    const toResolve = existingOpen.filter((f) => !openCodes.has(f.code as any));
    if (toResolve.length > 0) {
      await this.prisma.securityFinding.updateMany({
        where: { id: { in: toResolve.map((f) => f.id) } },
        data: { status: FindingStatus.RESOLVED, resolvedAt: new Date() },
      });
      this.logger.debug(`Resolved ${toResolve.length} finding(s) for device ${deviceId}`);
    }
  }
}
