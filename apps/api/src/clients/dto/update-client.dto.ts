import { IsString, MinLength } from 'class-validator';

export class UpdateClientDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
