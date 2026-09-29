import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedDevice {
  deviceId: string;
  tenantId: string;
  type: 'agent';
}

export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedDevice => {
    const request = ctx.switchToHttp().getRequest();
    return request.device as AuthenticatedDevice;
  },
);
