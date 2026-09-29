import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permission } from '@vgon/shared';
import { ScreenshotsService } from './screenshots.service';
import { ListScreenshotsDto } from './dto/list-screenshots.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AgentAuthGuard } from '../common/guards/agent-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentDevice, AuthenticatedDevice } from '../common/decorators/current-device.decorator';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // generous ceiling for a single compressed JPEG frame

@Controller()
export class ScreenshotsController {
  constructor(private readonly screenshots: ScreenshotsService) {}

  // --- Web-user (dashboard) endpoints ---

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.SCREEN_VIEW)
  @Get('screenshots/latest')
  latestPerDevice(@CurrentUser() user: AuthenticatedUser, @Query('clientId') clientId?: string) {
    return this.screenshots.latestPerDevice(user, clientId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.SCREEN_VIEW)
  @Get('devices/:id/screenshots')
  list(@CurrentUser() user: AuthenticatedUser, @Param('id') deviceId: string, @Query() query: ListScreenshotsDto) {
    return this.screenshots.list(user, deviceId, query.take);
  }

  // --- Agent (device) endpoint ---
  // Body is raw JPEG bytes (Content-Type: image/jpeg) — parsed by the express.raw() middleware
  // registered for this exact path in ScreenModule, not the global JSON body parser.

  @UseGuards(AgentAuthGuard)
  @Post('agents/screenshots')
  async upload(@CurrentDevice() device: AuthenticatedDevice, @Req() req: Request) {
    const image = req.body;
    if (!Buffer.isBuffer(image) || image.length === 0) {
      throw new BadRequestException('Expected a non-empty binary body');
    }
    if (image.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image too large');
    }

    const capturedAtHeader = req.header('x-captured-at');
    const capturedAt = capturedAtHeader ? new Date(capturedAtHeader) : new Date();
    const width = parseIntHeader(req.header('x-image-width'));
    const height = parseIntHeader(req.header('x-image-height'));

    return this.screenshots.store({
      tenantId: device.tenantId,
      deviceId: device.deviceId,
      capturedAt: Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt,
      width,
      height,
      image,
    });
  }
}

function parseIntHeader(value?: string): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}
