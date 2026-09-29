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
}
