import { generateOpaqueToken, hashToken } from './token.util';

describe('token.util', () => {
  it('generates unique high-entropy tokens', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it('hashes deterministically so a stored hash can be matched on lookup', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toEqual(hashToken(token));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken(generateOpaqueToken())).not.toEqual(hashToken(generateOpaqueToken()));
  });
});
