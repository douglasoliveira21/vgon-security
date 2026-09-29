import { AgentsService } from './agents.service';
import { hashToken } from './token.util';

describe('AgentsService.validateProvisioningToken', () => {
  const build = (row: { usedAt: Date | null; expiresAt: Date } | null) => {
    const findUnique = jest.fn().mockResolvedValue(row);
    const update = jest.fn();
    const service = new AgentsService({ provisioningToken: { findUnique, update } } as any, {} as any, {} as any, {
      agentHeartbeats: { inc: jest.fn() },
    } as any);
    return { service, findUnique, update };
  };
  const token = 'a-long-enough-token';
  const future = new Date(Date.now() + 60_000);

  it('accepts an unused, unexpired token without consuming it', async () => {
    const { service, findUnique, update } = build({ usedAt: null, expiresAt: future });
    await expect(service.validateProvisioningToken({ provisioningToken: token })).resolves.toEqual({
      valid: true,
      expiresAt: future,
    });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashToken(token) } }));
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['NOT_FOUND', null],
    ['ALREADY_USED', { usedAt: new Date(), expiresAt: future }],
    ['EXPIRED', { usedAt: null, expiresAt: new Date(Date.now() - 1000) }],
  ])('rejects with %s', async (reason, row) => {
    const { service } = build(row as any);
    await expect(service.validateProvisioningToken({ provisioningToken: token })).resolves.toEqual({
      valid: false,
      reason,
    });
  });
});
