import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  companyName!: string;

  @IsString()
  @Matches(/^[a-z0-9-]{2,50}$/, {
    message: 'slug must be lowercase letters, numbers and hyphens only',
  })
  slug!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @MinLength(2)
  ownerName!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
