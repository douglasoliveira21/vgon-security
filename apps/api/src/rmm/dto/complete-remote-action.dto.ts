import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CompleteRemoteActionDto {
  @IsBoolean()
  success!: boolean;

  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
