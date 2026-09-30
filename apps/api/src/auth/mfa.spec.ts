import { UnauthorizedException } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { generateMfaSecret } from '../common/mfa.util';

describe('AuthService MFA', () => {
  function build(user: Record<string, unknown> | null) {
    const findFirst = jest.fn().mockResolvedValue(user);
    const findUnique = jest.fn().mockResolvedValue(user);
    const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...user, ...data }));
    const prisma = { user: { findFirst, findUnique, update } } as any;
    const jwt = { sign: jest.fn().mockReturnValue('signed-jwt') } as any;
    const audit = { log: jest.fn() } as any;
    const metrics = { authenticationFailures: { inc: jest.fn() } } as any;
    const email = {} as any;
    const turnstile = { enabled: false, verify: jest.fn() } as any;
    const service = new AuthService(prisma, jwt, audit, metrics, email, turnstile);
    return { service, prisma, metrics };
  }

  it('login() demands an mfaToken once the account has MFA enabled', async () => {
    const secret = generateMfaSecret();
    const passwordHash = await argon2.hash('correct-password');
    const { service } = build({
      id: 'u1',
      tenantId: 't1',
      email: 'a@b.com',
      role: 'VIEWER',
      isActive: true,
      passwordHash,
      mfaEnabled: true,
      mfaSecret: secret,
    });

    await expect(service.login({ email: 'a@b.com', password: 'correct-password' })).rejects.toMatchObject({
      response: { mfaRequired: true },
    });
  });

  it('login() rejects an invalid mfaToken', async () => {
    const secret = generateMfaSecret();
    const passwordHash = await argon2.hash('correct-password');
    const { service } = build({
      id: 'u1',
      tenantId: 't1',
      email: 'a@b.com',
      role: 'VIEWER',
      isActive: true,
      passwordHash,
      mfaEnabled: true,
      mfaSecret: secret,
    });

    await expect(
      service.login({ email: 'a@b.com', password: 'correct-password', mfaToken: '000000' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('login() succeeds with a valid mfaToken', async () => {
    const secret = generateMfaSecret();
    const passwordHash = await argon2.hash('correct-password');
    const { service } = build({
      id: 'u1',
      tenantId: 't1',
      email: 'a@b.com',
      role: 'VIEWER',
      isActive: true,
      passwordHash,
      mfaEnabled: true,
      mfaSecret: secret,
    });

    const validCode = authenticator.generate(secret);
    const result = await service.login({ email: 'a@b.com', password: 'correct-password', mfaToken: validCode });
    expect(result.accessToken).toBe('signed-jwt');
  });

  it('enableMfa() rejects an invalid confirmation code', async () => {
    const secret = generateMfaSecret();
    const { service } = build({ id: 'u1', tenantId: 't1', email: 'a@b.com', mfaEnabled: false, mfaSecret: secret });

    await expect(
      service.enableMfa({ userId: 'u1', tenantId: 't1', email: 'a@b.com', role: 'VIEWER', clientId: null }, {
        token: '000000',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('enableMfa() accepts a valid confirmation code and turns mfaEnabled on', async () => {
    const secret = generateMfaSecret();
    const { service, prisma } = build({ id: 'u1', tenantId: 't1', email: 'a@b.com', mfaEnabled: false, mfaSecret: secret });

    const validCode = authenticator.generate(secret);
    const result = await service.enableMfa(
      { userId: 'u1', tenantId: 't1', email: 'a@b.com', role: 'VIEWER', clientId: null },
      { token: validCode },
    );

    expect(result).toEqual({ mfaEnabled: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { mfaEnabled: true } });
  });
});
