import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Permission } from '@vgon/shared';
import { AgentsService } from './agents.service';
import { CreateProvisioningTokenDto } from './dto/create-provisioning-token.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { ValidateProvisioningTokenDto } from './dto/validate-provisioning-token.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AgentAuthGuard } from '../common/guards/agent-auth.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentDevice, AuthenticatedDevice } from '../common/decorators/current-device.decorator';
import { PolicyResolverService } from '../policies/policy-resolver.service';

@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly policyResolver: PolicyResolverService,
  ) {}

  // --- Web-user (admin) endpoints ---

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.AGENTS_MANAGE)
  @Post('provisioning-tokens')
  createProvisioningToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProvisioningTokenDto,
    @Ip() ip: string,
  ) {
    return this.agentsService.createProvisioningToken(user, dto, ip);
  }

  // --- Agent (device) endpoints ---

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('provisioning-tokens/validate')
  validateProvisioningToken(@Body() dto: ValidateProvisioningTokenDto) {
    return this.agentsService.validateProvisioningToken(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  registerDevice(@Body() dto: RegisterDeviceDto, @Ip() ip: string) {
    return this.agentsService.registerDevice(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('token/refresh')
  refresh(@Body() dto: RefreshTokenDto, @Ip() ip: string) {
    return this.agentsService.refresh(dto, ip);
  }

  @UseGuards(AgentAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('heartbeat')
  heartbeat(@CurrentDevice() device: AuthenticatedDevice, @Body() dto: HeartbeatDto) {
    return this.agentsService.heartbeat(device, dto);
  }

  // Section 16: the Agent polls this instead of policy being pushed, and caches the result
  // locally so it keeps applying the last-known-good policy if the Cloud is unreachable.
  @UseGuards(AgentAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('policy')
  getEffectivePolicy(@CurrentDevice() device: AuthenticatedDevice) {
    return this.policyResolver.resolveForDevice(device.tenantId, device.deviceId);
  }
}
