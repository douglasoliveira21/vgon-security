import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { BINARY_UPLOAD_PATHS } from './screen/screen.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.use(helmet());
  // Screenshot/screen-frame uploads are raw JPEG bytes, not JSON — matched by exact path so this
  // never touches any other route's body parsing. Nest's default JSON/urlencoded body parsers
  // only act on their own content-types, so registration order relative to them doesn't matter.
  app.use(BINARY_UPLOAD_PATHS, express.raw({ type: '*/*', limit: '3mb' }));
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  Logger.log(`VGON Security+ API listening on :${port}`, 'Bootstrap');
}

bootstrap();
