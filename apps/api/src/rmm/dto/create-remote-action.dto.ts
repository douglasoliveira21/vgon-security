import { IsEnum } from 'class-validator';
import { RemoteActionType } from '@vgon/shared';

export class CreateRemoteActionDto {
  @IsEnum(RemoteActionType)
  type!: RemoteActionType;
}
