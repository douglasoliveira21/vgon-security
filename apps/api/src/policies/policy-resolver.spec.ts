import { BrowserUrlPolicy, PolicyScope, PolicyType } from '@vgon/shared';
import { PolicyRow, resolveEffectivePolicy } from './policy-resolver';
import { DEFAULT_BROWSER_POLICY, DEFAULT_USB_POLICY } from './policy-defaults';

function row(scope: PolicyScope, type: PolicyType, settings: Record<string, unknown>, updatedAt = new Date()): PolicyRow {
  return { scope, type, settings, updatedAt };
}

describe('resolveEffectivePolicy', () => {
  it('falls back to hardcoded defaults when no policy rows exist for a device', () => {
    const effective = resolveEffectivePolicy([]);

    expect(effective.browser).toEqual(DEFAULT_BROWSER_POLICY);
    expect(effective.usb).toEqual(DEFAULT_USB_POLICY);
    expect(effective.version).toBe(0);
  });

  it('applies a TENANT-wide override on top of defaults', () => {
    const rows = [row(PolicyScope.TENANT, PolicyType.BROWSER, { urlPolicy: BrowserUrlPolicy.FULL_URL })];

    const effective = resolveEffectivePolicy(rows);

    expect(effective.browser.urlPolicy).toBe(BrowserUrlPolicy.FULL_URL);
    // Fields the tenant policy didn't set still fall through to the hardcoded default.
    expect(effective.browser.sensitiveParams).toEqual(DEFAULT_BROWSER_POLICY.sensitiveParams);
  });

  it('a DEVICE-level override wins over a TENANT-level one for the same field', () => {
    const rows = [
      row(PolicyScope.TENANT, PolicyType.BROWSER, { urlPolicy: BrowserUrlPolicy.FULL_URL }),
      row(PolicyScope.DEVICE, PolicyType.BROWSER, { urlPolicy: BrowserUrlPolicy.DOMAIN_ONLY }),
    ];

    const effective = resolveEffectivePolicy(rows);

    expect(effective.browser.urlPolicy).toBe(BrowserUrlPolicy.DOMAIN_ONLY);
  });

  it('resolution order is independent of the input array order (SITE still loses to GROUP)', () => {
    const rows = [
      row(PolicyScope.GROUP, PolicyType.USB, { defaultPolicy: 'BLOCK' }),
      row(PolicyScope.SITE, PolicyType.USB, { defaultPolicy: 'ALLOW' }),
    ];

    const effective = resolveEffectivePolicy(rows);

    expect(effective.usb.defaultPolicy).toBe('BLOCK');
  });

  it('a more specific level only overrides the fields it actually sets, not the whole object', () => {
    const rows = [
      row(PolicyScope.TENANT, PolicyType.USB, {
        defaultPolicy: 'MONITOR',
        allowlist: [{ vendorId: '0781' }],
      }),
      // GROUP only tightens the policy, doesn't repeat the allowlist.
      row(PolicyScope.GROUP, PolicyType.USB, { defaultPolicy: 'BLOCK' }),
    ];

    const effective = resolveEffectivePolicy(rows);

    expect(effective.usb.defaultPolicy).toBe('BLOCK');
    expect(effective.usb.allowlist).toEqual([{ vendorId: '0781' }]);
  });

  it('different policy types are resolved independently of each other', () => {
    const rows = [
      row(PolicyScope.DEVICE, PolicyType.BROWSER, { urlPolicy: BrowserUrlPolicy.FULL_URL }),
      row(PolicyScope.DEVICE, PolicyType.USB, { defaultPolicy: 'BLOCK' }),
    ];

    const effective = resolveEffectivePolicy(rows);

    expect(effective.browser.urlPolicy).toBe(BrowserUrlPolicy.FULL_URL);
    expect(effective.usb.defaultPolicy).toBe('BLOCK');
    expect(effective.file).toEqual(expect.objectContaining({ watchFolders: expect.any(Array) }));
  });

  it('version reflects the most recent update among the applicable rows', () => {
    const older = new Date('2026-01-01T00:00:00Z');
    const newer = new Date('2026-06-01T00:00:00Z');
    const rows = [
      row(PolicyScope.TENANT, PolicyType.BROWSER, {}, older),
      row(PolicyScope.DEVICE, PolicyType.USB, {}, newer),
    ];

    const effective = resolveEffectivePolicy(rows);

    expect(effective.version).toBe(newer.getTime());
  });

  it('the CollectionPolicy master switch can disable a specific collector', () => {
    const rows = [row(PolicyScope.DEVICE, PolicyType.COLLECTION, { usbCollectorEnabled: false })];

    const effective = resolveEffectivePolicy(rows);

    expect(effective.collection.usbCollectorEnabled).toBe(false);
    expect(effective.collection.browserCollectorEnabled).toBe(true); // untouched, still default
  });
});
