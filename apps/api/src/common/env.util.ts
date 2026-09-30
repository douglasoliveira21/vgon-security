// Fails fast instead of silently signing/verifying tokens with a fallback secret that's
// hardcoded in this (public) repository — anyone who can read the source could otherwise forge
// a valid JWT for any user/device if the real secret was never configured. The fallback still
// works outside production so local dev needs no .env setup.
export function requireSecret(envVar: string, devFallback: string): string {
  const value = process.env[envVar];
  if (value) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${envVar} is not set. Refusing to start in production with the public, hardcoded fallback secret.`,
    );
  }

  return devFallback;
}
