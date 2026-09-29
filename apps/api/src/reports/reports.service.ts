import { Injectable } from '@nestjs/common';
import { DeviceStatus, FindingStatus } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { computeLiveStatus } from '../devices/devices.util';

const DEFAULT_DAYS = 7;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Fleet-wide snapshot for the Reports landing page (section 18/22): device health, open
  // security posture, and recent ingestion volume — everything a "how's the fleet doing right
  // now" glance needs, in one round trip instead of the dashboard firing five separate requests.
  async overview(tenantId: string) {
    const [devices, findingsBySeverity, eventsLast24h, eventsLast7d, softwareCount] = await Promise.all([
      this.prisma.device.findMany({ where: { tenantId }, select: { status: true, lastSeenAt: true } }),
      this.prisma.securityFinding.groupBy({
        by: ['severity'],
        where: { tenantId, status: FindingStatus.OPEN },
        _count: { _all: true },
      }),
      this.prisma.event.count({ where: { tenantId, occurredAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } }),
      this.prisma.event.count({ where: { tenantId, occurredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) } } }),
      this.prisma.installedSoftware.count({ where: { tenantId, removedAt: null } }),
    ]);

    const deviceStatusCounts: Record<string, number> = {};
    for (const d of devices) {
      const live = computeLiveStatus(d.lastSeenAt, d.status as DeviceStatus);
      deviceStatusCounts[live] = (deviceStatusCounts[live] ?? 0) + 1;
    }

    const openFindingsBySeverity: Record<string, number> = {};
    for (const row of findingsBySeverity) {
      openFindingsBySeverity[row.severity] = row._count._all;
    }

    return {
      totalDevices: devices.length,
      deviceStatusCounts,
      openFindingsBySeverity,
      eventsLast24h,
      eventsLast7d,
      activeSoftwarePackages: softwareCount,
    };
  }

  // Daily event volume — the one chart every fleet-monitoring product's Reports page has.
  async eventsTimeseries(tenantId: string, days = DEFAULT_DAYS) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);

    // Prisma's query builder can't GROUP BY a truncated timestamp, so this is raw SQL — still
    // fully parameterized (tagged template), no string concatenation of user input.
    const rows = await this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT date_trunc('day', "occurredAt") AS day, COUNT(*)::bigint AS count
      FROM "events"
      WHERE "tenantId" = ${tenantId} AND "occurredAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `;

    return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
  }

  async topEventTypes(tenantId: string, days = DEFAULT_DAYS, limit = 10) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const rows = await this.prisma.event.groupBy({
      by: ['eventType'],
      where: { tenantId, occurredAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { eventType: 'desc' } },
      take: limit,
    });
    return rows.map((r) => ({ eventType: r.eventType, count: r._count._all }));
  }

  // Domain lives inside the JSON `data` column (browser.navigation events only), so this is
  // also raw SQL — Prisma has no JSON-path GROUP BY. Still parameterized.
  async topDomains(tenantId: string, days = DEFAULT_DAYS, limit = 10) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const rows = await this.prisma.$queryRaw<Array<{ domain: string; count: bigint }>>`
      SELECT data->>'domain' AS domain, COUNT(*)::bigint AS count
      FROM "events"
      WHERE "tenantId" = ${tenantId}
        AND "eventType" = 'browser.navigation'
        AND "occurredAt" >= ${since}
        AND data->>'domain' IS NOT NULL
        AND data->>'domain' != ''
      GROUP BY domain
      ORDER BY count DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ domain: r.domain, count: Number(r.count) }));
  }
}
