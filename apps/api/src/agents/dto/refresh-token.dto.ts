import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  deviceId!: string;

  @IsString()
  refreshToken!: string;
}
