import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserActionTokenType } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../common/email.service';
import { generateOpaqueToken, hashToken } from '../common/token.util';
import { clientScopeWhere } from '../common/client-scope.util';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  private webOrigin(): string {
    return process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  }

  // tenantId always comes from the authenticated actor, never from the request body/params. A
  // client-scoped actor only sees/manages users scoped to their own client.
  async list(actor: AuthenticatedUser) {
    const users = await this.prisma.user.findMany({
      where: { tenantId: actor.tenantId, ...clientScopeWhere(actor) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        passwordHash: true,
        clientId: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    // Never expose the hash itself — just whether the invite has been accepted yet.
    return users.map(({ passwordHash, ...user }) => ({ ...user, hasPassword: passwordHash !== null }));
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto) {
    // A client-scoped admin can only invite users into their own client (can't grant broader
    // visibility than they themselves have); a full-access admin picks any client, or none
    // (full-tenant access for the new user too).
    if (actor.clientId && dto.clientId && dto.clientId !== actor.clientId) {
      throw new ForbiddenException('Cannot invite a user into a different client');
    }
    const clientId = actor.clientId ?? dto.clientId ?? null;

    if (clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId: actor.tenantId } });
      if (!client) throw new NotFoundException('Client not found');
    }

    const existing = await this.prisma.user.findFirst({
      where: { tenantId: actor.tenantId, email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already in use for this tenant');
    }

    const user = await this.prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        clientId,
        email: dto.email.toLowerCase(),
        name: dto.name,
        role: dto.role,
        passwordHash: null,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, clientId: true },
    });

    const plaintext = generateOpaqueToken();
    await this.prisma.userActionToken.create({
      data: {
        userId: user.id,
        tenantId: actor.tenantId,
        type: UserActionTokenType.INVITE,
        tokenHash: hashToken(plaintext),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60_000),
      },
    });

    const link = `${this.webOrigin()}/accept-invite?token=${plaintext}`;
    await this.email.send({
      to: user.email,
      subject: 'You have been invited to VGON Security+',
      text: `${actor.email} invited you to join their VGON Security+ tenant as ${user.role}. Accept your invite within ${INVITE_TTL_DAYS} days: ${link}`,
      html: `<p>${actor.email} invited you to join their VGON Security+ tenant as <strong>${user.role}</strong>.</p><p><a href="${link}">Accept invite</a> (expires in ${INVITE_TTL_DAYS} days).</p>`,
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'user.invited',
      resource: `user:${user.id}`,
      result: 'SUCCESS',
      metadata: { email: user.email, role: user.role, clientId },
    });

    return user;
  }

  async setActive(actor: AuthenticatedUser, userId: string, isActive: boolean) {
    // Verify tenant (and client, when scoped) ownership before mutating — never trust a bare id
    // from the URL alone.
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: actor.tenantId, ...clientScopeWhere(actor) },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: isActive ? 'user.activated' : 'user.deactivated',
      resource: `user:${userId}`,
      result: 'SUCCESS',
    });

    return user;
  }
}
