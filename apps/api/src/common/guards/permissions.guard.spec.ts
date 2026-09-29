import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, Role } from '@vgon/shared';
import { PermissionsGuard } from './permissions.guard';

function makeContext(user: { role: string } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('allows a VIEWER to read devices', () => {
    const reflector = { getAllAndOverride: () => [Permission.DEVICES_READ] } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(makeContext({ role: Role.VIEWER }))).toBe(true);
  });

  it('rejects a VIEWER trying to manage policies', () => {
    const reflector = { getAllAndOverride: () => [Permission.POLICIES_MANAGE] } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(() => guard.canActivate(makeContext({ role: Role.VIEWER }))).toThrow(ForbiddenException);
  });

  it('allows any request through when no permissions are required', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });
});
