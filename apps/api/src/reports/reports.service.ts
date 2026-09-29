import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeviceStatus, FindingStatus } from '@vgon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { computeLiveStatus } from '../devices/devices.util';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { clientScopeWhere, deviceClientScopeWhere } from '../common/client-scope.util';

const DEFAULT_DAYS = 7;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Fleet-wide snapshot for the Reports landing page (section 18/22): device health, open
  // security posture, and recent ingestion volume — everything a "how's the fleet doing right
  // now" glance needs, in one round trip instead of the dashboard firing five separate requests.
  async overview(actor: AuthenticatedUser, requestedClientId?: string) {
    const tenantId = actor.tenantId;
    const [devices, findingsBySeverity, eventsLast24h, eventsLast7d, softwareCount] = await Promise.all([
      this.prisma.device.findMany({
        where: { tenantId, ...clientScopeWhere(actor, requestedClientId) },
        select: { status: true, lastSeenAt: true },
      }),
      this.prisma.securityFinding.groupBy({
        by: ['severity'],
        where: { tenantId, status: FindingStatus.OPEN, ...deviceClientScopeWhere(actor, requestedClientId) },
        _count: { _all: true },
      }),
      this.prisma.event.count({
        where: {
          tenantId,
          occurredAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
          ...deviceClientScopeWhere(actor, requestedClientId),
        },
      }),
      this.prisma.event.count({
        where: {
          tenantId,
          occurredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
          ...deviceClientScopeWhere(actor, requestedClientId),
        },
      }),
      this.prisma.installedSoftware.count({
        where: { tenantId, removedAt: null, ...deviceClientScopeWhere(actor, requestedClientId) },
      }),
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
  async eventsTimeseries(actor: AuthenticatedUser, days = DEFAULT_DAYS, requestedClientId?: string) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const effectiveClientId = actor.clientId ?? requestedClientId;
    const clientFilter = effectiveClientId ? Prisma.sql`AND d."clientId" = ${effectiveClientId}` : Prisma.empty;

    // Prisma's query builder can't GROUP BY a truncated timestamp, so this is raw SQL — still
    // fully parameterized (tagged template + Prisma.sql fragments), no string concatenation of
    // user input. Joins devices only to apply the client filter above when one is needed.
    const rows = await this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT date_trunc('day', e."occurredAt") AS day, COUNT(*)::bigint AS count
      FROM "events" e
      JOIN "devices" d ON d."id" = e."deviceId"
      WHERE e."tenantId" = ${actor.tenantId} AND e."occurredAt" >= ${since} ${clientFilter}
      GROUP BY day
      ORDER BY day ASC
    `;

    return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
  }

  async topEventTypes(actor: AuthenticatedUser, days = DEFAULT_DAYS, limit = 10, requestedClientId?: string) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const rows = await this.prisma.event.groupBy({
      by: ['eventType'],
      where: {
        tenantId: actor.tenantId,
        occurredAt: { gte: since },
        ...deviceClientScopeWhere(actor, requestedClientId),
      },
      _count: { _all: true },
      orderBy: { _count: { eventType: 'desc' } },
      take: limit,
    });
    return rows.map((r) => ({ eventType: r.eventType, count: r._count._all }));
  }

  // Domain lives inside the JSON `data` column (browser.navigation events only), so this is
  // also raw SQL — Prisma has no JSON-path GROUP BY. Still parameterized.
  async topDomains(actor: AuthenticatedUser, days = DEFAULT_DAYS, limit = 10, requestedClientId?: string) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const effectiveClientId = actor.clientId ?? requestedClientId;
    const clientFilter = effectiveClientId ? Prisma.sql`AND d."clientId" = ${effectiveClientId}` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{ domain: string; count: bigint }>>`
      SELECT e.data->>'domain' AS domain, COUNT(*)::bigint AS count
      FROM "events" e
      JOIN "devices" d ON d."id" = e."deviceId"
      WHERE e."tenantId" = ${actor.tenantId}
        AND e."eventType" = 'browser.navigation'
        AND e."occurredAt" >= ${since}
        AND e.data->>'domain' IS NOT NULL
        AND e.data->>'domain' != ''
        ${clientFilter}
      GROUP BY domain
      ORDER BY count DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ domain: r.domain, count: Number(r.count) }));
  }
}
