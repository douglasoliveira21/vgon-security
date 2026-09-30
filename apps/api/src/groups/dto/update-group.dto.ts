import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  // Empty string clears the assignment; omitted leaves it unchanged.
  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}
