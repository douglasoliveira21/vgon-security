import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { MetricsModule } from '../observability/metrics.module';
import { EmailModule } from '../common/email.module';
import { TurnstileModule } from '../common/turnstile.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), MetricsModule, EmailModule, TurnstileModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
