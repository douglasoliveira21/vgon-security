import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl, Length, Matches } from 'class-validator';
import { ReleaseChannel } from '@vgon/shared';

export class PublishReleaseDto {
  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[\w.]+)?$/, { message: 'version must be semver, e.g. 1.4.0' })
  version!: string;

  @IsEnum(ReleaseChannel)
  channel!: ReleaseChannel;

  @IsUrl({ require_tld: false })
  downloadUrl!: string;

  @IsString()
  @Length(64, 64, { message: 'sha256 must be a 64-character hex digest' })
  @Matches(/^[0-9a-fA-F]{64}$/, { message: 'sha256 must be hex' })
  sha256!: string;

  @IsOptional()
  @IsString()
  releaseNotes?: string;

  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;
}
