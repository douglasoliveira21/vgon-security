import { IsString, MinLength } from 'class-validator';

export class ValidateProvisioningTokenDto {
  @IsString()
  @MinLength(10)
  provisioningToken!: string;
}
