import { Module } from '@nestjs/common';
import { RemoteActionsController } from './remote-actions.controller';
import { AgentReleasesController } from './agent-releases.controller';
import { ScreenModule } from '../screen/screen.module';

@Module({
  imports: [ScreenModule],
  controllers: [RemoteActionsController, AgentReleasesController],
})
export class RmmModule {}
