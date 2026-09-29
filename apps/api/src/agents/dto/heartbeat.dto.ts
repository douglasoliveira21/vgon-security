import { IsIn, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class HeartbeatDto {
  @IsString()
  agentVersion!: string;

  @IsString()
  os!: string;

  @IsOptional()
  @IsNumber()
  cpuUsagePercent?: number;

  @IsOptional()
  @IsNumber()
  memoryUsagePercent?: number;

  @IsOptional()
  @IsNumber()
  diskUsagePercent?: number;

  @IsOptional()
  @IsObject()
  collectorStatus?: Record<string, string>;

  @IsOptional()
  @IsString()
  policyVersion?: string;
}
