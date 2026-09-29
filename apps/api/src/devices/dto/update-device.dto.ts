import { IsOptional, IsString } from 'class-validator';

export class UpdateDeviceDto {
  // Empty string clears the assignment; omitted leaves it unchanged.
  @IsOptional()
  @IsString()
  siteId?: string | null;

  @IsOptional()
  @IsString()
  groupId?: string | null;
}
