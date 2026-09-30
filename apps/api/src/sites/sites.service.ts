import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { clientScopeWhere } from '../common/client-scope.util';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(actor: AuthenticatedUser) {
    return this.prisma.site.findMany({
      where: { tenantId: actor.tenantId, ...clientScopeWhere(actor) },
      include: { client: { select: { id: true, name: true } }, _count: { select: { devices: true, groups: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateSiteDto) {
    // A client-scoped user may only create locations under their own client; a full-access user
    // must say which client a new location belongs to.
    const clientId = actor.clientId ?? dto.clientId;
    if (actor.clientId && dto.clientId && dto.clientId !== actor.clientId) {
      throw new ForbiddenException('Cannot create a location under a different client');
    }

    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId: actor.tenantId } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const existing = await this.prisma.site.findFirst({ where: { tenantId: actor.tenantId, name: dto.name } });
    if (existing) {
      throw new ConflictException('A location with this name already exists');
    }

    const site = await this.prisma.site.create({ data: { tenantId: actor.tenantId, clientId, name: dto.name } });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'site.created',
      resource: `site:${site.id}`,
      result: 'SUCCESS',
      metadata: { name: site.name, clientId },
    });

    return site;
  }

  async update(actor: AuthenticatedUser, siteId: string, dto: UpdateSiteDto) {
    const existing = await this.prisma.site.findFirst({
      where: { id: siteId, tenantId: actor.tenantId, ...clientScopeWhere(actor) },
    });
    if (!existing) {
      throw new NotFoundException('Location not found');
    }

    if (actor.clientId && dto.clientId && dto.clientId !== actor.clientId) {
      throw new ForbiddenException('Cannot move a location to a different client');
    }

    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, tenantId: actor.tenantId } });
      if (!client) throw new NotFoundException('Client not found');
    }

    if (dto.name && dto.name !== existing.name) {
      const nameTaken = await this.prisma.site.findFirst({ where: { tenantId: actor.tenantId, name: dto.name } });
      if (nameTaken) throw new ConflictException('A location with this name already exists');
    }

    const updated = await this.prisma.site.update({
      where: { id: siteId },
      data: { name: dto.name, clientId: dto.clientId },
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'site.updated',
      resource: `site:${siteId}`,
      result: 'SUCCESS',
      metadata: { name: updated.name, clientId: updated.clientId },
    });

    return updated;
  }

  async remove(actor: AuthenticatedUser, siteId: string) {
    const existing = await this.prisma.site.findFirst({
      where: { id: siteId, tenantId: actor.tenantId, ...clientScopeWhere(actor) },
    });
    if (!existing) {
      throw new NotFoundException('Location not found');
    }

    // Devices/groups referencing this site have siteId set to SetNull at the DB level — they
    // aren't deleted, just unassigned.
    await this.prisma.site.delete({ where: { id: siteId } });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'site.deleted',
      resource: `site:${siteId}`,
      result: 'SUCCESS',
    });

    return { id: siteId };
  }
}
