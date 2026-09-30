import { Injectable, Logger } from '@nestjs/common';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Not configured (no TURNSTILE_SECRET_KEY) is treated as "captcha disabled" rather than an
// error — matches EmailService's pattern of degrading gracefully instead of hard-failing local
// dev or a deployment that hasn't set it up yet. The frontend mirrors this: it only renders the
// widget when its own NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  get enabled(): boolean {
    return Boolean(process.env.TURNSTILE_SECRET_KEY);
  }

  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!this.enabled) return true;
    if (!token) return false;

    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    try {
      const res = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch (err) {
      // Cloudflare unreachable is a Cloudflare-side outage, not proof the user is a bot — but
      // failing open here would defeat the point of the captcha, so this fails closed.
      this.logger.error('Turnstile verification request failed', err as Error);
      return false;
    }
  }
}
