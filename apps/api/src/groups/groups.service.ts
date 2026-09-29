import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: string) {
    return this.prisma.group.findMany({
      where: { tenantId },
      include: { site: { select: { id: true, name: true } }, _count: { select: { devices: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateGroupDto) {
    const existing = await this.prisma.group.findFirst({ where: { tenantId: actor.tenantId, name: dto.name } });
    if (existing) {
      throw new ConflictException('A group with this name already exists');
    }

    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({ where: { id: dto.siteId, tenantId: actor.tenantId } });
      if (!site) {
        throw new NotFoundException('Site not found');
      }
    }

    const group = await this.prisma.group.create({
      data: { tenantId: actor.tenantId, name: dto.name, siteId: dto.siteId },
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'group.created',
      resource: `group:${group.id}`,
      result: 'SUCCESS',
      metadata: { name: group.name, siteId: group.siteId },
    });

    return group;
  }

  async remove(actor: AuthenticatedUser, groupId: string) {
    const existing = await this.prisma.group.findFirst({ where: { id: groupId, tenantId: actor.tenantId } });
    if (!existing) {
      throw new NotFoundException('Group not found');
    }

    // Devices referencing this group have groupId set to SetNull at the DB level — they aren't
    // deleted, just unassigned.
    await this.prisma.group.delete({ where: { id: groupId } });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'group.deleted',
      resource: `group:${groupId}`,
      result: 'SUCCESS',
    });

    return { id: groupId };
  }
}
