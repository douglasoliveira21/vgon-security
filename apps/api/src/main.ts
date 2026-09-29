import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.use(helmet());
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
