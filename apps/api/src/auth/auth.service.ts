import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Role } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';

const ACCESS_TOKEN_TTL = '15m';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async registerTenant(dto: RegisterTenantDto, ip?: string) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException('Tenant slug already in use');
    }

    const passwordHash = await argon2.hash(dto.password);

    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: { name: dto.companyName, slug: dto.slug },
      });
      await tx.user.create({
        data: {
          tenantId: created.id,
          email: dto.ownerEmail.toLowerCase(),
          passwordHash,
          name: dto.ownerName,
          role: Role.OWNER,
        },
      });
      return created;
    });

    await this.audit.log({
      tenantId: tenant.id,
      actorEmail: dto.ownerEmail,
      action: 'tenant.registered',
      resource: `tenant:${tenant.id}`,
      result: 'SUCCESS',
      ip,
    });

    return this.login({ email: dto.ownerEmail, password: dto.password }, ip);
  }

  async login(dto: LoginDto, ip?: string) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email } });

    const passwordValid = user ? await argon2.verify(user.passwordHash, dto.password) : false;

    if (!user || !user.isActive || !passwordValid) {
      await this.audit.log({
        tenantId: user?.tenantId ?? 'unknown',
        actorEmail: email,
        action: 'auth.login',
        resource: 'auth',
        result: 'FAILURE',
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role };
    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET ?? 'dev-web-access-secret',
      expiresIn: ACCESS_TOKEN_TTL,
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.login',
      resource: 'auth',
      result: 'SUCCESS',
      ip,
    });

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }
}
