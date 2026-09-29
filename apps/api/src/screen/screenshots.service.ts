import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { clientScopeWhere, deviceClientScopeWhere } from '../common/client-scope.util';

const RETENTION_DAYS = 7;
const DEFAULT_TAKE = 12;

export interface StoreScreenshotInput {
  tenantId: string;
  deviceId: string;
  capturedAt: Date;
  width?: number;
  height?: number;
  image: Buffer;
}

@Injectable()
export class ScreenshotsService {
  private readonly logger = new Logger(ScreenshotsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async store(input: StoreScreenshotInput): Promise<{ id: string }> {
    const row = await this.prisma.screenshot.create({
      data: {
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        capturedAt: input.capturedAt,
        width: input.width,
        height: input.height,
        sizeBytes: input.image.byteLength,
        image: input.image,
      },
      select: { id: true },
    });

    // Pruned on write rather than via a separate cron job — this app has no cron/scheduler
    // infrastructure beyond BullMQ's queue processing, and a screenshot only ever arrives via
    // this same write path, so "delete anything past retention for this device" here is
    // sufficient and keeps the table bounded without adding new infrastructure. At one capture a
    // minute this deletes at most a handful of rows per call once steady-state is reached.
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
    const { count } = await this.prisma.screenshot.deleteMany({
      where: { deviceId: input.deviceId, capturedAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.debug(`Pruned ${count} screenshot(s) past the ${RETENTION_DAYS}-day retention for device ${input.deviceId}`);
    }

    return row;
  }

  /** Metadata + inlined base64 image — simplest viable payload for a thumbnail grid at this
   * app's scale (see EASYPANEL.md/README's stated preference against speculative infrastructure);
   * revisit with a dedicated image-bytes endpoint if screenshot volume ever makes this heavy. */
  async list(actor: AuthenticatedUser, deviceId: string, take = DEFAULT_TAKE) {
    const rows = await this.prisma.screenshot.findMany({
      // Scoped via the device relation too — otherwise a client-scoped user could read another
      // client's screenshots just by guessing/copying a deviceId from elsewhere in the tenant.
      where: { tenantId: actor.tenantId, deviceId, ...deviceClientScopeWhere(actor) },
      orderBy: { capturedAt: 'desc' },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      capturedAt: r.capturedAt,
      width: r.width,
      height: r.height,
      sizeBytes: r.sizeBytes,
      imageBase64: r.image.toString('base64'),
    }));
  }

  /** One row per enrolled device: the dashboard's overview grid. */
  async latestPerDevice(actor: AuthenticatedUser, requestedClientId?: string) {
    const devices = await this.prisma.device.findMany({
      where: { tenantId: actor.tenantId, ...clientScopeWhere(actor, requestedClientId) },
      select: { id: true, hostname: true },
    });
    const results = await Promise.all(
      devices.map(async (d) => {
        const latest = await this.prisma.screenshot.findFirst({
          where: { tenantId: actor.tenantId, deviceId: d.id },
          orderBy: { capturedAt: 'desc' },
        });
        return {
          deviceId: d.id,
          hostname: d.hostname,
          capturedAt: latest?.capturedAt ?? null,
          imageBase64: latest ? latest.image.toString('base64') : null,
        };
      }),
    );
    return results;
  }
}
