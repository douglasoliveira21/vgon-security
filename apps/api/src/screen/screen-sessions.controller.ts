import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Permission } from '@vgon/shared';
import { ScreenSessionsService } from './screen-sessions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AgentAuthGuard } from '../common/guards/agent-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentDevice, AuthenticatedDevice } from '../common/decorators/current-device.decorator';

const MAX_FRAME_BYTES = 1024 * 1024;
const HEARTBEAT_MS = 15_000;

// Tiny framed binary protocol over a single long-lived HTTP response — deliberately not
// WebSocket/SSE to avoid new dependencies: `[1-byte type][4-byte BE length][payload]`.
// type 1 = JPEG frame, 2 = heartbeat (keeps proxies from closing an idle connection), 3 = end.
function writeFrame(res: Response, type: number, payload: Buffer): void {
  const header = Buffer.alloc(5);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(payload.length, 1);
  res.write(header);
  if (payload.length > 0) res.write(payload);
}

@Controller()
export class ScreenSessionsController {
  constructor(private readonly sessions: ScreenSessionsService) {}

  // --- Web-user (dashboard) endpoints ---

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.SCREEN_VIEW)
  @Post('devices/:id/screen-sessions')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') deviceId: string, @Ip() ip: string) {
    return this.sessions.start(user.userId, user.email, user.tenantId, deviceId, ip);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.SCREEN_VIEW)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('devices/:id/screen-sessions/:sessionId/stop')
  async stop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') deviceId: string,
    @Param('sessionId') sessionId: string,
    @Ip() ip: string,
  ) {
    await this.sessions.stop(user.userId, user.email, user.tenantId, deviceId, sessionId, ip);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.SCREEN_VIEW)
  @Get('devices/:id/screen-sessions/:sessionId/stream')
  async stream(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') deviceId: string,
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Throws 404 before any header is sent if the session doesn't belong to this tenant/device.
    await this.sessions.getForStream(user.tenantId, deviceId, sessionId);

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable buffering on nginx-style reverse proxies
    });
    req.socket.setTimeout(0); // this is a deliberately long-lived response, not a stuck request

    const heartbeat = setInterval(() => writeFrame(res, 2, Buffer.alloc(0)), HEARTBEAT_MS);

    const unsubscribe = this.sessions.subscribeToFrames(sessionId, (payload) => {
      if (payload.length === 0) {
        // End-of-session sentinel published by ScreenSessionsService.onSessionEnded().
        writeFrame(res, 3, Buffer.alloc(0));
        cleanup();
        res.end();
        return;
      }
      writeFrame(res, 1, payload);
    });

    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      unsubscribe();
    }

    req.on('close', cleanup);
  }

  // --- Agent (device) endpoint ---
  // Body is a raw JPEG frame (Content-Type: image/jpeg) — see ScreenModule's express.raw() middleware.

  @UseGuards(AgentAuthGuard)
  @Post('agents/screen-sessions/:id/frame')
  async frame(@CurrentDevice() device: AuthenticatedDevice, @Param('id') sessionId: string, @Req() req: Request) {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('Expected a non-empty binary body');
    }
    if (body.length > MAX_FRAME_BYTES) {
      throw new BadRequestException('Frame too large');
    }

    return this.sessions.acceptFrame(device.tenantId, device.deviceId, sessionId, body);
  }
}
