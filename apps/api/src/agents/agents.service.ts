import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AgentTokenStatus, DeviceStatus } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedDevice } from '../common/decorators/current-device.decorator';
import { CreateProvisioningTokenDto } from './dto/create-provisioning-token.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { ValidateProvisioningTokenDto } from './dto/validate-provisioning-token.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { generateOpaqueToken, hashToken } from './token.util';
import { MetricsService } from '../observability/metrics.service';
import { requireSecret } from '../common/env.util';

const AGENT_ACCESS_TTL = '10m';
const AGENT_ACCESS_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;
const DEFAULT_PROVISIONING_MINUTES = 60;

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  async createProvisioningToken(actor: AuthenticatedUser, dto: CreateProvisioningTokenDto, ip?: string) {
    const plaintext = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + (dto.expiresInMinutes ?? DEFAULT_PROVISIONING_MINUTES) * 60_000);

    // A client-scoped actor can only issue tokens for their own client; a full-access actor may
    // say which client the resulting device belongs to (or none).
    const clientId = actor.clientId ?? dto.clientId;

    await this.prisma.provisioningToken.create({
      data: {
        tenantId: actor.tenantId,
        tokenHash: hashToken(plaintext),
        clientId,
        siteId: dto.siteId,
        groupId: dto.groupId,
        createdById: actor.userId,
        expiresAt,
      },
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'agent.provisioning_token.created',
      resource: 'provisioning_token',
      result: 'SUCCESS',
      ip,
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    // Plaintext token is returned exactly once; only its hash is ever persisted.
    return { provisioningToken: plaintext, expiresAt };
  }

  /** Read-only check used by the MSI installer — never consumes the token (only register does). */
  async validateProvisioningToken(dto: ValidateProvisioningTokenDto) {
    const token = await this.prisma.provisioningToken.findUnique({
      where: { tokenHash: hashToken(dto.provisioningToken) },
      select: { usedAt: true, expiresAt: true },
    });
    if (!token) return { valid: false, reason: 'NOT_FOUND' as const };
    if (token.usedAt) return { valid: false, reason: 'ALREADY_USED' as const };
    if (token.expiresAt < new Date()) return { valid: false, reason: 'EXPIRED' as const };
    return { valid: true, expiresAt: token.expiresAt };
  }

  async registerDevice(dto: RegisterDeviceDto, ip?: string) {
    const tokenHash = hashToken(dto.provisioningToken);
    const token = await this.prisma.provisioningToken.findUnique({ where: { tokenHash } });

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired provisioning token');
    }

    const refreshToken = generateOpaqueToken();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000);

    const device = await this.prisma.$transaction(async (tx) => {
      const created = await tx.device.create({
        data: {
          tenantId: token.tenantId,
          clientId: token.clientId,
          siteId: token.siteId,
          groupId: token.groupId,
          hostname: dto.hostname,
          agentVersion: dto.agentVersion,
          os: dto.os,
          osVersion: dto.osVersion,
          status: DeviceStatus.ONLINE,
          lastSeenAt: new Date(),
        },
      });

      await tx.agentCredential.create({
        data: {
          deviceId: created.id,
          refreshTokenHash: hashToken(refreshToken),
          expiresAt: refreshExpiresAt,
        },
      });

      await tx.provisioningToken.update({
        where: { id: token.id },
        data: { usedAt: new Date(), usedByDeviceId: created.id },
      });

      return created;
    });

    const accessToken = this.signAccessToken(device.id, device.tenantId);

    await this.audit.log({
      tenantId: token.tenantId,
      action: 'device.registered',
      resource: `device:${device.id}`,
      result: 'SUCCESS',
      ip,
      metadata: { hostname: dto.hostname, agentVersion: dto.agentVersion },
    });

    return {
      deviceId: device.id,
      accessToken,
      refreshToken,
      expiresIn: AGENT_ACCESS_TTL_SECONDS,
    };
  }

  async refresh(dto: RefreshTokenDto, ip?: string) {
    const credential = await this.prisma.agentCredential.findUnique({
      where: { deviceId: dto.deviceId },
      include: { device: true },
    });

    const valid =
      credential &&
      credential.status === AgentTokenStatus.ACTIVE &&
      credential.expiresAt > new Date() &&
      credential.refreshTokenHash === hashToken(dto.refreshToken);

    if (!valid || !credential) {
      // A mismatched-but-known device is a strong replay/compromise signal, so it's audited
      // even though we don't know which credential generation was presented.
      await this.audit.log({
        tenantId: credential?.device.tenantId ?? 'unknown',
        action: 'agent.token.refresh_rejected',
        resource: `device:${dto.deviceId}`,
        result: 'FAILURE',
        ip,
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newRefreshToken = generateOpaqueToken();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000);

    await this.prisma.agentCredential.update({
      where: { deviceId: dto.deviceId },
      data: {
        refreshTokenHash: hashToken(newRefreshToken),
        lastRotatedAt: new Date(),
        lastUsedAt: new Date(),
        lastUsedIp: ip,
        expiresAt: refreshExpiresAt,
      },
    });

    const accessToken = this.signAccessToken(credential.device.id, credential.device.tenantId);

    await this.audit.log({
      tenantId: credential.device.tenantId,
      action: 'agent.token.refreshed',
      resource: `device:${dto.deviceId}`,
      result: 'SUCCESS',
      ip,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: AGENT_ACCESS_TTL_SECONDS,
    };
  }

  async heartbeat(device: AuthenticatedDevice, dto: HeartbeatDto) {
    this.metrics.agentHeartbeats.inc();
    await this.prisma.device.update({
      where: { id: device.deviceId },
      data: {
        lastSeenAt: new Date(),
        agentVersion: dto.agentVersion,
        os: dto.os,
        policyVersion: dto.policyVersion,
        status: DeviceStatus.ONLINE,
        lastHeartbeat: dto as any,
      },
    });

    return { acknowledged: true, serverTime: new Date().toISOString() };
  }

  private signAccessToken(deviceId: string, tenantId: string): string {
    return this.jwt.sign(
      { sub: deviceId, tenantId, type: 'agent' },
      {
        secret: requireSecret('AGENT_JWT_SECRET', 'dev-agent-access-secret'),
        expiresIn: AGENT_ACCESS_TTL,
      },
    );
  }
}
