import { IsEnum, IsOptional } from 'class-validator';
import { PolicyScope, PolicyType } from '@vgon/shared';

export class QueryPoliciesDto {
  @IsOptional()
  @IsEnum(PolicyScope)
  scope?: PolicyScope;

  @IsOptional()
  @IsEnum(PolicyType)
  type?: PolicyType;
}
