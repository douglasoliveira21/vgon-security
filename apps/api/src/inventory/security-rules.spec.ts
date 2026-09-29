import { EventSeverity, FindingCode } from '@vgon/shared';
import { evaluateSecurityFindings } from './security-rules';

describe('evaluateSecurityFindings', () => {
  it('returns no findings for a fully secure device', () => {
    const findings = evaluateSecurityFindings({
      defenderEnabled: true,
      firewallEnabled: true,
      bitlockerEnabled: true,
      secureBootEnabled: true,
      tpmPresent: true,
      uacEnabled: true,
      windowsUpdatePendingCritical: 0,
      localAdministrators: ['Administrator'],
    });

    expect(findings).toEqual([]);
  });

  it('flags a disabled Defender as HIGH severity', () => {
    const findings = evaluateSecurityFindings({ defenderEnabled: false });

    expect(findings).toContainEqual(
      expect.objectContaining({ code: FindingCode.DEFENDER_DISABLED, severity: EventSeverity.HIGH }),
    );
  });

  it('flags a disabled firewall as HIGH severity', () => {
    const findings = evaluateSecurityFindings({ firewallEnabled: false });

    expect(findings).toContainEqual(
      expect.objectContaining({ code: FindingCode.FIREWALL_DISABLED, severity: EventSeverity.HIGH }),
    );
  });

  it('flags disabled BitLocker as MEDIUM severity', () => {
    const findings = evaluateSecurityFindings({ bitlockerEnabled: false });

    expect(findings).toContainEqual(
      expect.objectContaining({ code: FindingCode.BITLOCKER_DISABLED, severity: EventSeverity.MEDIUM }),
    );
  });

  it('flags missing TPM as LOW severity', () => {
    const findings = evaluateSecurityFindings({ tpmPresent: false });

    expect(findings).toContainEqual(expect.objectContaining({ code: FindingCode.TPM_MISSING, severity: EventSeverity.LOW }));
  });

  it('flags pending critical updates with the count in the description', () => {
    const findings = evaluateSecurityFindings({ windowsUpdatePendingCritical: 3 });

    const finding = findings.find((f) => f.code === FindingCode.WINDOWS_UPDATE_PENDING_CRITICAL);
    expect(finding?.severity).toBe(EventSeverity.HIGH);
    expect(finding?.description).toContain('3');
  });

  it('does not flag pending updates when the count is zero', () => {
    const findings = evaluateSecurityFindings({ windowsUpdatePendingCritical: 0 });

    expect(findings.some((f) => f.code === FindingCode.WINDOWS_UPDATE_PENDING_CRITICAL)).toBe(false);
  });

  it('flags multiple local administrators but not a single one', () => {
    const single = evaluateSecurityFindings({ localAdministrators: ['Administrator'] });
    const multiple = evaluateSecurityFindings({ localAdministrators: ['Administrator', 'bob', 'eve'] });

    expect(single.some((f) => f.code === FindingCode.MULTIPLE_LOCAL_ADMINS)).toBe(false);
    expect(multiple).toContainEqual(expect.objectContaining({ code: FindingCode.MULTIPLE_LOCAL_ADMINS }));
  });

  it('treats an undefined field as "unknown", not "insecure" — no false positive from a partial payload', () => {
    const findings = evaluateSecurityFindings({});

    expect(findings).toEqual([]);
  });

  it('reports every applicable finding at once for a device with multiple problems', () => {
    const findings = evaluateSecurityFindings({
      defenderEnabled: false,
      firewallEnabled: false,
      bitlockerEnabled: false,
    });

    expect(findings).toHaveLength(3);
  });
});
