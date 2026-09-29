import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EventSeverity, FindingStatus } from '@vgon/shared';

export class QueryFindingsDto {
  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;

  @IsOptional()
  @IsEnum(EventSeverity)
  severity?: EventSeverity;
}
