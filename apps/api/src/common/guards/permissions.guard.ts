import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, ROLE_PERMISSIONS, Role } from '@vgon/shared';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.role) {
      throw new ForbiddenException('Missing role in authentication context');
    }

    const granted = ROLE_PERMISSIONS[user.role as Role] ?? [];
    const hasAll = required.every((permission) => granted.includes(permission));
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
