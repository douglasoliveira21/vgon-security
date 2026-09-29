import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // tenantId always comes from the authenticated actor, never from the request body/params.
  list(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: actor.tenantId, email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already in use for this tenant');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        email: dto.email.toLowerCase(),
        name: dto.name,
        role: dto.role,
        passwordHash,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'user.created',
      resource: `user:${user.id}`,
      result: 'SUCCESS',
      metadata: { email: user.email, role: user.role },
    });

    return user;
  }

  async setActive(actor: AuthenticatedUser, userId: string, isActive: boolean) {
    // Verify tenant ownership before mutating — never trust a bare id from the URL alone.
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: actor.tenantId },
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
