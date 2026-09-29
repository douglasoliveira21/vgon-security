import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateProvisioningTokenDto {
  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  expiresInMinutes?: number; // default 60
}
