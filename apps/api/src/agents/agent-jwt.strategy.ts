import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AgentTokenStatus, DeviceStatus } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { requireSecret } from '../common/env.util';

export interface AgentJwtPayload {
  sub: string; // deviceId
  tenantId: string;
  type: 'agent';
}

@Injectable()
export class AgentJwtStrategy extends PassportStrategy(Strategy, 'agent-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireSecret('AGENT_JWT_SECRET', 'dev-agent-access-secret'),
    });
  }

  // Revocation must take effect immediately, not just at token expiry, so we re-check
  // credential status and device status on every request rather than trusting the JWT alone.
  async validate(payload: AgentJwtPayload) {
    if (payload.type !== 'agent') {
      throw new UnauthorizedException('Invalid token type');
    }

    const device = await this.prisma.device.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId },
      include: { credential: true },
    });

    if (
      !device ||
      device.status === DeviceStatus.BLOCKED ||
      device.status === DeviceStatus.DECOMMISSIONED ||
      !device.credential ||
      device.credential.status !== AgentTokenStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Device credential is no longer valid');
    }

    return { deviceId: device.id, tenantId: device.tenantId, type: 'agent' as const };
  }
}
