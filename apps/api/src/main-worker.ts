import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

// Standalone entrypoint for the BullMQ event worker (Phase 8 — see worker.module.ts). No HTTP
// listener: createApplicationContext just wires up the DI container, which is enough for the
// @Processor-decorated EventsProcessor to start consuming the queue.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'warn', 'error'],
  });

  const shutdown = async () => {
    Logger.log('Shutting down event worker...', 'Bootstrap');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  Logger.log('VGON Security+ event worker started (no HTTP listener)', 'Bootstrap');
}

bootstrap();
