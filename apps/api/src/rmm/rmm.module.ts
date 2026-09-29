import { Module } from '@nestjs/common';
import { RemoteActionsController } from './remote-actions.controller';
import { AgentReleasesController } from './agent-releases.controller';

@Module({
  controllers: [RemoteActionsController, AgentReleasesController],
})
export class RmmModule {}
