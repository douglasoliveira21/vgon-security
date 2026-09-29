import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  siteId?: string;

  // Only used when siteId is omitted — otherwise the group's client is implied by its location.
  @IsOptional()
  @IsString()
  clientId?: string;
}
