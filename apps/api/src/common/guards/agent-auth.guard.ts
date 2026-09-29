import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Separate strategy/secret space from web-user JWTs so a stolen device token
// can never be used to call user-facing endpoints and vice versa (device binding, section 4).
@Injectable()
export class AgentAuthGuard extends AuthGuard('agent-jwt') {}
