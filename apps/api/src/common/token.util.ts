import { randomBytes, createHash } from 'crypto';

// High-entropy opaque tokens (password-reset/invite links) are hashed with SHA-256 for
// storage/lookup, distinct from password hashing (argon2) since these are already uniformly
// random and not attacker-guessable — the concern is DB leakage, not brute force. Mirrors
// agents/token.util.ts's provisioning-token pattern.
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
