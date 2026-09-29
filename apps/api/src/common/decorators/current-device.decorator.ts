import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedDevice {
  deviceId: string;
  tenantId: string;
  type: 'agent';
}

export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedDevice => {
    const request = ctx.switchToHttp().getRequest();
    // Passport's agent-jwt strategy puts the value returned by validate() on request.user.
    return request.user as AuthenticatedDevice;
  },
);
