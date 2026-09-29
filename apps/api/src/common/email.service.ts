import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// No SMTP env vars configured (e.g. local dev, or a deployment that hasn't set them up yet)
// falls back to logging the email instead of failing the request — the invite/reset link is
// still creatable and usable by copying it from the log, it just isn't actually emailed.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromAddress: string;

  constructor() {
    this.fromAddress = process.env.SMTP_FROM ?? 'VGON Security+ <no-reply@vgon.local>';

    const host = process.env.SMTP_HOST;
    if (!host) {
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP not configured — logging email instead of sending. To: ${input.to}, Subject: ${input.subject}\n${input.text}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}
