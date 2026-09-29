import { IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(10)
  provisioningToken!: string;

  @IsString()
  hostname!: string;

  @IsString()
  agentVersion!: string;

  @IsOptional()
  @IsString()
  os?: string;

  @IsOptional()
  @IsString()
  osVersion?: string;
}
