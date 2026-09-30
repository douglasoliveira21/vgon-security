import { requireSecret } from './env.util';

describe('requireSecret', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns the env var when set, regardless of NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    process.env.MY_SECRET = 'real-secret';
    expect(requireSecret('MY_SECRET', 'dev-fallback')).toBe('real-secret');
  });

  it('falls back to the dev value outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.MY_SECRET;
    expect(requireSecret('MY_SECRET', 'dev-fallback')).toBe('dev-fallback');
  });

  it('throws instead of falling back when unset in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MY_SECRET;
    expect(() => requireSecret('MY_SECRET', 'dev-fallback')).toThrow('MY_SECRET');
  });
});
