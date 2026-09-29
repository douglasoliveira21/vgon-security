import { IsEnum, IsObject, IsOptional, IsString, ValidateIf } from 'class-validator';
import { PolicyScope, PolicyType } from '@vgon/shared';

export class UpsertPolicyDto {
  @IsEnum(PolicyScope)
  scope!: PolicyScope;

  // Required for SITE/GROUP/DEVICE scope; must be absent for TENANT scope (there's only one
  // tenant-wide default, so it wouldn't mean anything).
  @ValidateIf((dto) => dto.scope !== PolicyScope.TENANT)
  @IsString()
  scopeId?: string;

  @IsEnum(PolicyType)
  type!: PolicyType;

  @IsObject()
  settings!: Record<string, unknown>;
}
