import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { clientSelfScopeWhere } from '../common/client-scope.util';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // A client-scoped user only ever sees their own client here — used to populate their own
  // "current client" context, never a picker to switch into another one.
  list(actor: AuthenticatedUser) {
    return this.prisma.client.findMany({
      where: { tenantId: actor.tenantId, ...clientSelfScopeWhere(actor) },
      include: { _count: { select: { sites: true, devices: true, users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateClientDto) {
    // Managing the client list itself is a full-tenant-access action — a user already scoped to
    // one client has no broader org structure to add another client to.
    if (actor.clientId) {
      throw new ForbiddenException('Only users with full-tenant access can manage clients');
    }

    const existing = await this.prisma.client.findFirst({ where: { tenantId: actor.tenantId, name: dto.name } });
    if (existing) {
      throw new ConflictException('A client with this name already exists');
    }

    const client = await this.prisma.client.create({ data: { tenantId: actor.tenantId, name: dto.name } });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'client.created',
      resource: `client:${client.id}`,
      result: 'SUCCESS',
      metadata: { name: client.name },
    });

    return client;
  }

  async remove(actor: AuthenticatedUser, clientId: string) {
    if (actor.clientId) {
      throw new ForbiddenException('Only users with full-tenant access can manage clients');
    }

    const existing = await this.prisma.client.findFirst({ where: { id: clientId, tenantId: actor.tenantId } });
    if (!existing) {
      throw new NotFoundException('Client not found');
    }

    // Sites/groups/devices/users referencing this client have clientId set to SetNull at the DB
    // level — they aren't deleted, just unassigned.
    await this.prisma.client.delete({ where: { id: clientId } });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'client.deleted',
      resource: `client:${clientId}`,
      result: 'SUCCESS',
    });

    return { id: clientId };
  }
}
