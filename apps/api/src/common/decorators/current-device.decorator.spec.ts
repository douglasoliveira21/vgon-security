import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentDevice } from './current-device.decorator';

// createParamDecorator's factory isn't exposed directly; read it back from the route-args metadata.
function resolve(request: unknown) {
  class Probe {
    handler(@CurrentDevice() _device: unknown) {}
  }
  const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler');
  const factory = meta[Object.keys(meta)[0]].factory;
  const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return factory(undefined, ctx);
}

describe('CurrentDevice', () => {
  it('returns what the agent-jwt strategy attached to request.user', () => {
    const device = { deviceId: 'd1', tenantId: 't1', type: 'agent' };
    expect(resolve({ user: device })).toBe(device);
  });
});
