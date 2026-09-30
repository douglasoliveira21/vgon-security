import { authenticator } from 'otplib';

// RFC 6238 TOTP, 30s step, 6 digits (otplib's defaults) — allow one step of drift each way so a
// slightly-off device clock doesn't lock people out.
authenticator.options = { window: 1 };

export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

export function mfaOtpauthUrl(accountName: string, secret: string): string {
  return authenticator.keyuri(accountName, 'VGON Security+', secret);
}

export function verifyMfaToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
