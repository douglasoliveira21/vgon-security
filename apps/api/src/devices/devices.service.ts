import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentTokenStatus, DeviceStatus } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { clientScopeWhere } from '../common/client-scope.util';
import { computeLiveStatus } from './devices.util';
import { UpdateDeviceDto } from './dto/update-device.dto';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedUser, requestedClientId?: string) {
    const devices = await this.prisma.device.findMany({
      where: { tenantId: actor.tenantId, ...clientScopeWhere(actor, requestedClientId) },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return devices.map((d) => ({ ...d, status: computeLiveStatus(d.lastSeenAt, d.status as DeviceStatus) }));
  }

  async get(actor: AuthenticatedUser, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId: actor.tenantId, ...clientScopeWhere(actor) },
    });
    if (!device) throw new NotFoundException('Device not found');
    return { ...device, status: computeLiveStatus(device.lastSeenAt, device.status as DeviceStatus) };
  }

  async revoke(actor: AuthenticatedUser, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId: actor.tenantId, ...clientScopeWhere(actor) },
    });
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

  async update(actor: AuthenticatedUser, deviceId: string, dto: UpdateDeviceDto) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId: actor.tenantId, ...clientScopeWhere(actor) },
    });
    if (!device) throw new NotFoundException('Device not found');

    if (actor.clientId && dto.clientId && dto.clientId !== actor.clientId) {
      throw new ForbiddenException('Cannot move a device to a different client');
    }

    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, tenantId: actor.tenantId } });
      if (!client) throw new NotFoundException('Client not found');
    }
    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({ where: { id: dto.siteId, tenantId: actor.tenantId } });
      if (!site) throw new NotFoundException('Location not found');
    }
    if (dto.groupId) {
      const group = await this.prisma.group.findFirst({ where: { id: dto.groupId, tenantId: actor.tenantId } });
      if (!group) throw new NotFoundException('Group not found');
    }

    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        // An explicit empty string means "clear the assignment"; undefined leaves it untouched.
        clientId: dto.clientId === undefined ? undefined : dto.clientId || null,
        siteId: dto.siteId === undefined ? undefined : dto.siteId || null,
        groupId: dto.groupId === undefined ? undefined : dto.groupId || null,
      },
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'device.updated',
      resource: `device:${deviceId}`,
      result: 'SUCCESS',
      metadata: { clientId: updated.clientId, siteId: updated.siteId, groupId: updated.groupId },
    });

    return { ...updated, status: computeLiveStatus(updated.lastSeenAt, updated.status as DeviceStatus) };
  }
}
