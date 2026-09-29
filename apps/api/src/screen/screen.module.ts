import { Module } from '@nestjs/common';
import { ScreenshotsController } from './screenshots.controller';
import { ScreenshotsService } from './screenshots.service';
import { ScreenSessionsController } from './screen-sessions.controller';
import { ScreenSessionsService } from './screen-sessions.service';
import { RedisPubSubService } from '../config/redis-pubsub.service';

// The Agent posts raw JPEG bytes (Content-Type: image/jpeg) to two routes in this module's
// controllers, not JSON — see main.ts's app.use(BINARY_UPLOAD_PATHS, express.raw(...)) for how
// those specific paths get a Buffer in req.body instead of going through the global JSON parser.
export const BINARY_UPLOAD_PATHS: string[] = ['/api/v1/agents/screenshots', '/api/v1/agents/screen-sessions'];

@Module({
  controllers: [ScreenshotsController, ScreenSessionsController],
  providers: [ScreenshotsService, ScreenSessionsService, RedisPubSubService],
  exports: [ScreenSessionsService],
})
export class ScreenModule {}
