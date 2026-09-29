import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentTokenStatus, DeviceStatus } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { computeLiveStatus } from './devices.util';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    const devices = await this.prisma.device.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return devices.map((d) => ({ ...d, status: computeLiveStatus(d.lastSeenAt, d.status as DeviceStatus) }));
  }

  async get(tenantId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, tenantId } });
    if (!device) throw new NotFoundException('Device not found');
    return { ...device, status: computeLiveStatus(device.lastSeenAt, device.status as DeviceStatus) };
  }

  async revoke(actor: AuthenticatedUser, deviceId: string) {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, tenantId: actor.tenantId } });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id: deviceId }, data: { status: DeviceStatus.BLOCKED } }),
      this.prisma.agentCredential.updateMany({
        where: { deviceId },
        data: { status: AgentTokenStatus.REVOKED },
      }),
    ]);

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'device.revoked',
      resource: `device:${deviceId}`,
      result: 'SUCCESS',
    });

    return { id: deviceId, status: DeviceStatus.BLOCKED };
  }
}
