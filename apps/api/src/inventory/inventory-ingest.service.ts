import { Injectable, Logger } from '@nestjs/common';
import { HardwareInventoryData, SoftwareInventoryData } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryIngestService {
  private readonly logger = new Logger(InventoryIngestService.name);

  constructor(private readonly prisma: PrismaService) {}

  async applyHardwareInventory(deviceId: string, data: HardwareInventoryData): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { hardware: data as any, lastInventoryAt: new Date() },
    });
  }

  // Only the delta is ever sent (section 12) — the Cloud is what maintains "current state".
  async applySoftwareInventory(tenantId: string, deviceId: string, data: SoftwareInventoryData): Promise<void> {
    for (const item of data.added ?? []) {
      await this.prisma.installedSoftware.upsert({
        where: { deviceId_name_version: { deviceId, name: item.name, version: item.version ?? '' } },
        create: {
          tenantId,
          deviceId,
          name: item.name,
          // Normalized to '' rather than null/undefined: Postgres treats NULL as distinct from
          // NULL for uniqueness purposes, which would let duplicate no-version rows slip through
          // the (deviceId, name, version) constraint.
          version: item.version ?? '',
          publisher: item.publisher,
          architecture: item.architecture,
        },
        update: {
          publisher: item.publisher,
          architecture: item.architecture,
          lastSeenAt: new Date(),
          removedAt: null,
        },
      });
    }

    for (const item of data.removed ?? []) {
      await this.prisma.installedSoftware.updateMany({
        where: { deviceId, name: item.name, version: item.version ?? '' },
        data: { removedAt: new Date() },
      });
    }

    if ((data.added?.length ?? 0) + (data.removed?.length ?? 0) > 0) {
      this.logger.debug(
        `Software delta for device ${deviceId}: +${data.added?.length ?? 0} / -${data.removed?.length ?? 0}`,
      );
    }
  }
}
