import { ScreenshotsService } from './screenshots.service';

function makePrisma() {
  return {
    screenshot: {
      create: jest.fn().mockResolvedValue({ id: 'shot-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    device: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('ScreenshotsService', () => {
  it('store() persists the image and prunes rows past the retention window for that device', async () => {
    const prisma = makePrisma();
    const service = new ScreenshotsService(prisma as any);
    const image = Buffer.from('jpeg-bytes');

    const result = await service.store({ tenantId: 't1', deviceId: 'd1', capturedAt: new Date(), image });

    expect(result).toEqual({ id: 'shot-1' });
    expect(prisma.screenshot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deviceId: 'd1', sizeBytes: image.byteLength, image }) }),
    );
    expect(prisma.screenshot.deleteMany).toHaveBeenCalledWith({
      where: { deviceId: 'd1', capturedAt: { lt: expect.any(Date) } },
    });
  });

  it('list() base64-encodes the stored image bytes rather than returning a raw Buffer', async () => {
    const prisma = makePrisma();
    const image = Buffer.from('hello');
    prisma.screenshot.findMany.mockResolvedValue([
      { id: 's1', capturedAt: new Date(), width: 100, height: 200, sizeBytes: 5, image },
    ]);
    const service = new ScreenshotsService(prisma as any);

    const rows = await service.list({ tenantId: 't1', clientId: null } as any, 'd1');

    expect(rows).toEqual([
      expect.objectContaining({ id: 's1', imageBase64: image.toString('base64') }),
    ]);
  });
});
