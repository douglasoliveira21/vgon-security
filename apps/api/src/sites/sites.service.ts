import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateSiteDto } from './dto/create-site.dto';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: string) {
    return this.prisma.site.findMany({
      where: { tenantId },
      include: { _count: { select: { devices: true, groups: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateSiteDto) {
    const existing = await this.prisma.site.findFirst({ where: { tenantId: actor.tenantId, name: dto.name } });
    if (existing) {
      throw new ConflictException('A site with this name already exists');
    }

    const site = await this.prisma.site.create({ data: { tenantId: actor.tenantId, name: dto.name } });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'site.created',
      resource: `site:${site.id}`,
      result: 'SUCCESS',
      metadata: { name: site.name },
    });

    return site;
  }

  async remove(actor: AuthenticatedUser, siteId: string) {
    const existing = await this.prisma.site.findFirst({ where: { id: siteId, tenantId: actor.tenantId } });
    if (!existing) {
      throw new NotFoundException('Site not found');
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
