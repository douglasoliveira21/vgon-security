import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface WebJwtPayload {
  sub: string; // userId
  tenantId: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'dev-web-access-secret',
    });
  }

  // Re-checks the user on every request instead of trusting stale JWT claims,
  // so a deactivated user or changed role takes effect immediately (never trust the client/token alone).
  async validate(payload: WebJwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Session no longer valid');
    }
    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
  }
}
