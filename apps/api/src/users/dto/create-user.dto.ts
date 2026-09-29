import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '@vgon/shared';

// No password field: a new user is invited by email and sets their own password when they
// accept (see AuthService.acceptInvite) — the tenant owner never handles another user's password.
export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(Role)
  role!: Role;
}
