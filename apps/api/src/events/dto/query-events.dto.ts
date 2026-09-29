import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryEventsDto {
  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}
