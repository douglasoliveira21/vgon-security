import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Issues a long-lived token instead of the normal short session — see AuthService.login.
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  // Required only when the account has MFA enabled — see AuthService.login.
  @IsOptional()
  @IsString()
  mfaToken?: string;

  // Cloudflare Turnstile widget response — required only when TURNSTILE_SECRET_KEY is
  // configured server-side (see TurnstileService).
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
