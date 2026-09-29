import { UnauthorizedException } from '@nestjs/common';
import { UserActionTokenType } from '@vgon/shared';
import { AuthService } from './auth.service';
import { hashToken } from '../common/token.util';

describe('AuthService.resetPassword / acceptInvite', () => {
  const build = (row: Record<string, unknown> | null) => {
    const findUnique = jest.fn().mockResolvedValue(row);
    const update = jest.fn();
    const $transaction = jest.fn().mockResolvedValue(undefined);
    const auditLog = jest.fn();
    const prisma = { userActionToken: { findUnique, update }, user: { update }, $transaction } as any;
    const audit = { log: auditLog } as any;
    const service = new AuthService(prisma, {} as any, audit, {} as any, {} as any);
    return { service };
  };

  const token = 'a-long-enough-opaque-token';
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  it('rejects resetPassword with an unknown token', async () => {
    const { service } = build(null);
    await expect(service.resetPassword({ token, password: 'newpassword1' })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects resetPassword with an already-used token', async () => {
    const { service } = build({
      type: UserActionTokenType.PASSWORD_RESET,
      usedAt: new Date(),
      expiresAt: future,
      tokenHash: hashToken(token),
    });
    await expect(service.resetPassword({ token, password: 'newpassword1' })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects resetPassword with an expired token', async () => {
    const { service } = build({
      type: UserActionTokenType.PASSWORD_RESET,
      usedAt: null,
      expiresAt: past,
      tokenHash: hashToken(token),
    });
    await expect(service.resetPassword({ token, password: 'newpassword1' })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects resetPassword when the token is actually an INVITE token', async () => {
    const { service } = build({
      type: UserActionTokenType.INVITE,
      usedAt: null,
      expiresAt: future,
      tokenHash: hashToken(token),
    });
    await expect(service.resetPassword({ token, password: 'newpassword1' })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects acceptInvite when the token is actually a PASSWORD_RESET token', async () => {
    const { service } = build({
      type: UserActionTokenType.PASSWORD_RESET,
      usedAt: null,
      expiresAt: future,
      tokenHash: hashToken(token),
      user: { email: 'invited@example.com' },
    });
    await expect(service.acceptInvite({ token, password: 'newpassword1' })).rejects.toThrow(UnauthorizedException);
  });
});
