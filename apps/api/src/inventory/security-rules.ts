import { EventSeverity, FindingCode, SecurityStateData } from '@vgon/shared';

export interface EvaluatedFinding {
  code: FindingCode;
  title: string;
  description: string;
  severity: EventSeverity;
}

// Pure rule set (section 13) — deliberately a fixed list for Phase 5. A configurable rule
// engine belongs to Phase 6's Policy Engine; this just answers "given this security.state
// payload, which findings should currently be OPEN?" so the caller can diff against what's
// already stored and open/resolve accordingly.
export function evaluateSecurityFindings(data: SecurityStateData): EvaluatedFinding[] {
  const findings: EvaluatedFinding[] = [];

  if (data.defenderEnabled === false) {
    findings.push({
      code: FindingCode.DEFENDER_DISABLED,
      title: 'Windows Defender is disabled',
      description: 'Real-time antivirus protection is turned off on this device.',
      severity: EventSeverity.HIGH,
    });
  }

  if (data.firewallEnabled === false) {
    findings.push({
      code: FindingCode.FIREWALL_DISABLED,
      title: 'Windows Firewall is disabled',
      description: 'The device has no active firewall protection.',
      severity: EventSeverity.HIGH,
    });
  }

  if (data.bitlockerEnabled === false) {
    findings.push({
      code: FindingCode.BITLOCKER_DISABLED,
      title: 'Disk encryption (BitLocker) is disabled',
      description: 'Data on this device is not protected at rest.',
      severity: EventSeverity.MEDIUM,
    });
  }

  if (data.secureBootEnabled === false) {
    findings.push({
      code: FindingCode.SECURE_BOOT_DISABLED,
      title: 'Secure Boot is disabled',
      description: 'The device firmware does not verify boot-chain integrity.',
      severity: EventSeverity.MEDIUM,
    });
  }

  if (data.tpmPresent === false) {
    findings.push({
      code: FindingCode.TPM_MISSING,
      title: 'No TPM detected',
      description: 'A Trusted Platform Module was not found; some security features may be unavailable.',
      severity: EventSeverity.LOW,
    });
  }

  if (data.uacEnabled === false) {
    findings.push({
      code: FindingCode.UAC_DISABLED,
      title: 'User Account Control is disabled',
      description: 'Privilege-elevation prompts are turned off on this device.',
      severity: EventSeverity.MEDIUM,
    });
  }

  if ((data.windowsUpdatePendingCritical ?? 0) > 0) {
    findings.push({
      code: FindingCode.WINDOWS_UPDATE_PENDING_CRITICAL,
      title: 'Critical Windows updates are pending',
      description: `${data.windowsUpdatePendingCritical} critical update(s) have not been installed.`,
      severity: EventSeverity.HIGH,
    });
  }

  if ((data.localAdministrators?.length ?? 0) > 1) {
    findings.push({
      code: FindingCode.MULTIPLE_LOCAL_ADMINS,
      title: 'Multiple local administrator accounts',
      description: `${data.localAdministrators!.length} accounts have local administrator rights: ${data.localAdministrators!.join(', ')}.`,
      severity: EventSeverity.MEDIUM,
    });
  }

  return findings;
}
