import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentJwtStrategy } from './agent-jwt.strategy';
import { PoliciesModule } from '../policies/policies.module';
import { MetricsModule } from '../observability/metrics.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), PoliciesModule, MetricsModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentJwtStrategy],
})
export class AgentsModule {}
