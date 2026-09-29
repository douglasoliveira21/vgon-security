import { AuthenticatedUser } from './decorators/current-user.decorator';

// A user with clientId set only ever sees that one client's data; clientId null means "every
// client under the tenant" (the original, full-tenant-scope behavior) — but a full-access user
// can still narrow their own view with a `?clientId=` query param on most list endpoints (the
// dashboard's global client filter, see lib/ClientFilter.tsx on the frontend). The actor's own
// restriction always wins: `requestedClientId` is ignored once `actor.clientId` is set.

function effectiveClientId(actor: AuthenticatedUser, requestedClientId?: string): string | undefined {
  return actor.clientId ?? requestedClientId ?? undefined;
}

/** For models with their own `clientId` column (Device, Site, Group, ProvisioningToken). */
export function clientScopeWhere(actor: AuthenticatedUser, requestedClientId?: string): { clientId?: string } {
  const id = effectiveClientId(actor, requestedClientId);
  return id ? { clientId: id } : {};
}

/** For the Client model itself — scopes to the actor's own client row instead of a field on it. */
export function clientSelfScopeWhere(actor: AuthenticatedUser): { id?: string } {
  return actor.clientId ? { id: actor.clientId } : {};
}

/** For models joined to Device only via a `deviceId` foreign key (Event, InstalledSoftware, ...). */
export function deviceClientScopeWhere(
  actor: AuthenticatedUser,
  requestedClientId?: string,
): { device?: { clientId: string } } {
  const id = effectiveClientId(actor, requestedClientId);
  return id ? { device: { clientId: id } } : {};
}
