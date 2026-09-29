import {
  AgentPolicySettings,
  ApplicationPolicySettings,
  BrowserPolicySettings,
  CollectionPolicySettings,
  EffectivePolicy,
  FilePolicySettings,
  PolicyScope,
  PolicyType,
  SecurityPolicySettings,
  UsbPolicySettings,
} from '@vgon/shared';
import {
  DEFAULT_AGENT_POLICY,
  DEFAULT_APPLICATION_POLICY,
  DEFAULT_BROWSER_POLICY,
  DEFAULT_COLLECTION_POLICY,
  DEFAULT_FILE_POLICY,
  DEFAULT_SECURITY_POLICY,
  DEFAULT_USB_POLICY,
} from './policy-defaults';

export interface PolicyRow {
  scope: PolicyScope;
  type: PolicyType;
  settings: Record<string, unknown>;
  updatedAt: Date;
}

// Most-specific-wins order (section 16: Tenant -> Site -> Group -> Device).
const SCOPE_SPECIFICITY: Record<PolicyScope, number> = {
  [PolicyScope.TENANT]: 0,
  [PolicyScope.SITE]: 1,
  [PolicyScope.GROUP]: 2,
  [PolicyScope.DEVICE]: 3,
};

// Only copies keys the more-specific row actually SET — `undefined`/absent fields fall through
// to the next-less-specific level instead of blanking it out.
function mergeDefined<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    if (override[key] !== undefined) result[key] = override[key] as T[keyof T];
  }
  return result;
}

function resolveType<T extends object>(rows: PolicyRow[], type: PolicyType, defaults: T): T {
  const matching = rows
    .filter((r) => r.type === type)
    .sort((a, b) => SCOPE_SPECIFICITY[a.scope] - SCOPE_SPECIFICITY[b.scope]);

  return matching.reduce<T>((acc, row) => mergeDefined(acc, row.settings as Partial<T>), defaults);
}

// Pure — takes already-fetched rows (tenant lookup happens in PolicyResolverService) so this is
// unit-testable without a database.
export function resolveEffectivePolicy(rows: PolicyRow[]): EffectivePolicy {
  const version = rows.reduce((max, r) => Math.max(max, r.updatedAt.getTime()), 0);

  return {
    version,
    browser: resolveType<BrowserPolicySettings>(rows, PolicyType.BROWSER, DEFAULT_BROWSER_POLICY),
    file: resolveType<FilePolicySettings>(rows, PolicyType.FILE, DEFAULT_FILE_POLICY),
    usb: resolveType<UsbPolicySettings>(rows, PolicyType.USB, DEFAULT_USB_POLICY),
    application: resolveType<ApplicationPolicySettings>(rows, PolicyType.APPLICATION, DEFAULT_APPLICATION_POLICY),
    security: resolveType<SecurityPolicySettings>(rows, PolicyType.SECURITY, DEFAULT_SECURITY_POLICY),
    agent: resolveType<AgentPolicySettings>(rows, PolicyType.AGENT, DEFAULT_AGENT_POLICY),
    collection: resolveType<CollectionPolicySettings>(rows, PolicyType.COLLECTION, DEFAULT_COLLECTION_POLICY),
  };
}
