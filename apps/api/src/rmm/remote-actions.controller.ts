import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Permission, RemoteActionStatus, RemoteActionType, ROLE_PERMISSIONS, Role } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScreenSessionsService } from '../screen/screen-sessions.service';
import { CreateRemoteActionDto } from './dto/create-remote-action.dto';
import { CompleteRemoteActionDto } from './dto/complete-remote-action.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AgentAuthGuard } from '../common/guards/agent-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentDevice, AuthenticatedDevice } from '../common/decorators/current-device.decorator';
import { clientScopeWhere, deviceClientScopeWhere } from '../common/client-scope.util';

@Controller()
export class RemoteActionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly screenSessions: ScreenSessionsService,
  ) {}

  // --- Web-user (admin) endpoints ---

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.DEVICES_MANAGE)
  @Post('devices/:id/actions')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') deviceId: string,
    @Body() dto: CreateRemoteActionDto,
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId: user.tenantId, ...clientScopeWhere(user) },
    });
    if (!device) throw new NotFoundException('Device not found');

    // WIPE_DEVICE is irreversible and far more consequential than every other action this
    // endpoint accepts — DEVICES_MANAGE alone (which every other action requires) is not enough
    // for it; the caller's role must separately carry DEVICES_WIPE.
    if (dto.type === RemoteActionType.WIPE_DEVICE) {
      const granted = ROLE_PERMISSIONS[user.role as Role] ?? [];
      if (!granted.includes(Permission.DEVICES_WIPE)) {
        throw new ForbiddenException('Insufficient permissions to wipe a device');
      }
    }

    const action = await this.prisma.remoteAction.create({
      data: {
        tenantId: user.tenantId,
        deviceId,
        type: dto.type,
        requestedById: user.userId,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorEmail: user.email,
      // Distinct action name for the one irreversible case, so it stands out in an audit search
      // rather than blending into every other (recoverable) remote action requested.
      action: dto.type === RemoteActionType.WIPE_DEVICE ? 'device.wipe_requested' : 'remote_action.requested',
      resource: `remote_action:${action.id}`,
      result: 'SUCCESS',
      metadata: { deviceId, type: dto.type },
    });

    return action;
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.DEVICES_READ)
  @Get('devices/:id/actions')
  async listForDevice(@CurrentUser() user: AuthenticatedUser, @Param('id') deviceId: string) {
    return this.prisma.remoteAction.findMany({
      where: { tenantId: user.tenantId, deviceId, ...deviceClientScopeWhere(user) },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
  }

  // --- Agent (device) endpoints ---

  // Fetching pending actions also acknowledges them (moves PENDING -> ACKNOWLEDGED) so a device
  // that polls again before finishing the first batch doesn't re-execute the same action twice.
  @UseGuards(AgentAuthGuard)
  @Get('agents/actions/pending')
  async listPendingForAgent(@CurrentDevice() device: AuthenticatedDevice) {
    const pending = await this.prisma.remoteAction.findMany({
      where: { tenantId: device.tenantId, deviceId: device.deviceId, status: RemoteActionStatus.PENDING },
      orderBy: { requestedAt: 'asc' },
    });

    if (pending.length > 0) {
      await this.prisma.remoteAction.updateMany({
        where: { id: { in: pending.map((a) => a.id) } },
        data: { status: RemoteActionStatus.ACKNOWLEDGED, acknowledgedAt: new Date() },
      });
    }

    return pending.map((a) => ({ id: a.id, type: a.type, requestedAt: a.requestedAt }));
  }

  @UseGuards(AgentAuthGuard)
  @Post('agents/actions/:id/complete')
  async completeAction(
    @CurrentDevice() device: AuthenticatedDevice,
    @Param('id') id: string,
    @Body() dto: CompleteRemoteActionDto,
  ) {
    // Ownership check prevents one device from completing another device's action.
    const existing = await this.prisma.remoteAction.findFirst({
      where: { id, tenantId: device.tenantId, deviceId: device.deviceId },
    });
    if (!existing) throw new NotFoundException('Action not found');

    const updated = await this.prisma.remoteAction.update({
      where: { id },
      data: {
        status: dto.success ? RemoteActionStatus.COMPLETED : RemoteActionStatus.FAILED,
        completedAt: new Date(),
        result: dto.result as any,
        errorMessage: dto.errorMessage,
      },
    });

    if (existing.type === RemoteActionType.START_SCREEN_VIEW) {
      // Lets any open dashboard stream close gracefully and frees the session's Redis keys
      // instead of waiting out their TTL — see ScreenSessionsService.
      await this.screenSessions.onSessionEnded(id);
    }

    return updated;
  }
}
