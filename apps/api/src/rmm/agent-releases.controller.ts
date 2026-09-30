import { Body, ConflictException, Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, ReleaseChannel } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PublishReleaseDto } from './dto/publish-release.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AgentAuthGuard } from '../common/guards/agent-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentDevice, AuthenticatedDevice } from '../common/decorators/current-device.decorator';

@Controller()
export class AgentReleasesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Web-user (admin) endpoints ---

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.AGENTS_MANAGE)
  @Post('agent-releases')
  async publish(@CurrentUser() user: AuthenticatedUser, @Body() dto: PublishReleaseDto) {
    const existing = await this.prisma.agentRelease.findUnique({
      where: { tenantId_version: { tenantId: user.tenantId, version: dto.version } },
    });
    if (existing) throw new ConflictException(`Version ${dto.version} was already published`);

    const release = await this.prisma.agentRelease.create({
      data: {
        tenantId: user.tenantId,
        version: dto.version,
        channel: dto.channel,
        downloadUrl: dto.downloadUrl,
        sha256: dto.sha256.toLowerCase(),
        releaseNotes: dto.releaseNotes,
        mandatory: dto.mandatory ?? false,
        publishedById: user.userId,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorEmail: user.email,
      action: 'agent_release.published',
      resource: `agent_release:${release.id}`,
      result: 'SUCCESS',
      metadata: { version: dto.version, channel: dto.channel },
    });

    return release;
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.AGENTS_MANAGE)
  @Get('agent-releases')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.agentRelease.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { publishedAt: 'desc' },
    });
  }

  // Deliberately DEVICES_READ, not AGENTS_MANAGE: this only ever exposes the one currently
  // published STABLE download link (never the full release history/audit trail AGENTS_MANAGE
  // guards), so anyone who can see devices — not just whoever manages releases — can grab the
  // installer for a new machine from the profile menu.
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.DEVICES_READ)
  @Get('agent-releases/latest')
  async latestForWebUser(@CurrentUser() user: AuthenticatedUser) {
    const release = await this.prisma.agentRelease.findFirst({
      where: { tenantId: user.tenantId, channel: ReleaseChannel.STABLE },
      orderBy: { publishedAt: 'desc' },
    });
    if (!release) throw new NotFoundException('No Agent release has been published yet');

    return { version: release.version, downloadUrl: release.downloadUrl };
  }

  // --- Agent (device) endpoint ---

  @UseGuards(AgentAuthGuard)
  @Get('agents/updates/latest')
  async latest(@CurrentDevice() device: AuthenticatedDevice, @Query('channel') channel?: ReleaseChannel) {
    const release = await this.prisma.agentRelease.findFirst({
      where: { tenantId: device.tenantId, channel: channel ?? ReleaseChannel.STABLE },
      orderBy: { publishedAt: 'desc' },
    });
    if (!release) throw new NotFoundException('No release published for this channel yet');

    return {
      version: release.version,
      channel: release.channel,
      downloadUrl: release.downloadUrl,
      sha256: release.sha256,
      mandatory: release.mandatory,
      releaseNotes: release.releaseNotes,
    };
  }
}
