import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @MinLength(1)
  name!: string;

  // Required unless the actor is themselves scoped to a single client (in which case it's
  // implied) — enforced in SitesService, not here, since that depends on the authenticated actor.
  @IsOptional()
  @IsString()
  clientId?: string;
}
