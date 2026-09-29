import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  tenantId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  resource: string;
  result: 'SUCCESS' | 'FAILURE';
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        resource: entry.resource,
        result: entry.result,
        ip: entry.ip ?? null,
        metadata: entry.metadata as any,
      },
    });
  }
}
