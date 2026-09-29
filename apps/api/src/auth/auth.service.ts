import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Role, UserActionTokenType } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { MetricsService } from '../observability/metrics.service';
import { EmailService } from '../common/email.service';
import { generateOpaqueToken, hashToken } from '../common/token.util';

const ACCESS_TOKEN_TTL = '15m';
const PASSWORD_RESET_TTL_HOURS = 1;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    private readonly email: EmailService,
  ) {}

  private webOrigin(): string {
    return process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  }

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

    // passwordHash is null for a user who was invited but hasn't accepted yet — argon2.verify
    // requires a hash, so such a user simply fails login until they accept their invite.
    const passwordValid = user?.passwordHash ? await argon2.verify(user.passwordHash, dto.password) : false;

    if (!user || !user.isActive || !passwordValid) {
      this.metrics.authenticationFailures.inc();
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
        clientId: user.clientId,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto, ip?: string) {
    const email = dto.email.toLowerCase();
    // Same lookup-by-email-only simplification as login() (no tenant context available at this
    // point). Always returns a generic success message regardless of whether the email
    // matched, so this endpoint can't be used to enumerate registered accounts.
    const user = await this.prisma.user.findFirst({ where: { email } });

    if (user && user.isActive) {
      const plaintext = generateOpaqueToken();
      await this.prisma.userActionToken.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          type: UserActionTokenType.PASSWORD_RESET,
          tokenHash: hashToken(plaintext),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60_000),
        },
      });

      const link = `${this.webOrigin()}/reset-password?token=${plaintext}`;
      await this.email.send({
        to: user.email,
        subject: 'Reset your VGON Security+ password',
        text: `We received a request to reset your password. Use this link within ${PASSWORD_RESET_TTL_HOURS} hour(s): ${link}\n\nIf you didn't request this, you can ignore this email.`,
        html: `<p>We received a request to reset your password.</p><p><a href="${link}">Reset password</a> (expires in ${PASSWORD_RESET_TTL_HOURS} hour${PASSWORD_RESET_TTL_HOURS > 1 ? 's' : ''}).</p><p>If you didn't request this, you can ignore this email.</p>`,
      });

      await this.audit.log({
        tenantId: user.tenantId,
        actorId: user.id,
        actorEmail: user.email,
        action: 'auth.password_reset.requested',
        resource: 'auth',
        result: 'SUCCESS',
        ip,
      });
    }

    return { message: 'If that email is registered, a reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto, ip?: string) {
    const token = await this.prisma.userActionToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });

    if (!token || token.type !== UserActionTokenType.PASSWORD_RESET || token.usedAt || token.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset link');
    }

    const passwordHash = await argon2.hash(dto.password);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: token.userId }, data: { passwordHash } }),
      this.prisma.userActionToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    ]);

    await this.audit.log({
      tenantId: token.tenantId,
      actorId: token.userId,
      action: 'auth.password_reset.completed',
      resource: `user:${token.userId}`,
      result: 'SUCCESS',
      ip,
    });

    return { message: 'Password updated successfully.' };
  }

  async acceptInvite(dto: AcceptInviteDto, ip?: string) {
    const token = await this.prisma.userActionToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: { user: true },
    });

    if (!token || token.type !== UserActionTokenType.INVITE || token.usedAt || token.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired invite link');
    }

    const passwordHash = await argon2.hash(dto.password);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: token.userId }, data: { passwordHash } }),
      this.prisma.userActionToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    ]);

    await this.audit.log({
      tenantId: token.tenantId,
      actorId: token.userId,
      actorEmail: token.user.email,
      action: 'auth.invite.accepted',
      resource: `user:${token.userId}`,
      result: 'SUCCESS',
      ip,
    });

    return this.login({ email: token.user.email, password: dto.password }, ip);
  }
}
