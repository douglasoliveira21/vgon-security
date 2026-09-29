import { FindingCode, FindingStatus } from '@vgon/shared';
import { SecurityEvaluatorService } from './security-evaluator.service';

describe('SecurityEvaluatorService', () => {
  function makePrismaMock(existingOpenFindings: { id: string; code: string }[] = []) {
    return {
      device: { update: jest.fn().mockResolvedValue({}) },
      securityFinding: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue(existingOpenFindings),
        updateMany: jest.fn().mockResolvedValue({ count: existingOpenFindings.length }),
      },
    } as any;
  }

  it('caches the raw security state on the device row', async () => {
    const prisma = makePrismaMock();
    const service = new SecurityEvaluatorService(prisma);

    await service.applySecurityState('tenant-1', 'device-1', { defenderEnabled: true });

    expect(prisma.device.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'device-1' } }),
    );
  });

  it('opens a finding for an insecure state', async () => {
    const prisma = makePrismaMock();
    const service = new SecurityEvaluatorService(prisma);

    await service.applySecurityState('tenant-1', 'device-1', { defenderEnabled: false });

    expect(prisma.securityFinding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deviceId_code: { deviceId: 'device-1', code: FindingCode.DEFENDER_DISABLED } },
      }),
    );
  });

  it('resolves a previously open finding once the condition clears', async () => {
    const prisma = makePrismaMock([{ id: 'finding-1', code: FindingCode.DEFENDER_DISABLED }]);
    const service = new SecurityEvaluatorService(prisma);

    // Defender is now enabled, so the previously open DEFENDER_DISABLED finding should resolve.
    await service.applySecurityState('tenant-1', 'device-1', { defenderEnabled: true });

    expect(prisma.securityFinding.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['finding-1'] } },
      data: { status: FindingStatus.RESOLVED, resolvedAt: expect.any(Date) },
    });
  });

  it('does not touch findings that are still applicable', async () => {
    const prisma = makePrismaMock([{ id: 'finding-1', code: FindingCode.DEFENDER_DISABLED }]);
    const service = new SecurityEvaluatorService(prisma);

    await service.applySecurityState('tenant-1', 'device-1', { defenderEnabled: false });

    expect(prisma.securityFinding.updateMany).not.toHaveBeenCalled();
  });
});
