import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { EventSeverity } from '@vgon/shared';

// Deliberately does NOT accept tenantId/deviceId from the Agent — those are derived
// server-side from the authenticated device (AgentAuthGuard), never trusted from the body.
export class EventEnvelopeDto {
  @IsUUID()
  eventId!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsString()
  agentVersion!: string;

  @IsISO8601()
  timestamp!: string;

  @IsString()
  eventType!: string;

  @IsEnum(EventSeverity)
  severity!: EventSeverity;

  @IsInt()
  @Min(1)
  schemaVersion!: number;

  @IsObject()
  data!: Record<string, unknown>;
}

export class IngestEventsDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => EventEnvelopeDto)
  events!: EventEnvelopeDto[];
}
