import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { ISendMailOptions } from '@nestjs-modules/mailer';
import { SystemLogLevel } from '@prisma/client';

import { SystemLogsService } from '@/modules/system-logs/system-logs.service';

@Injectable()
export class EmailService {
  private readonly frontendUrl: string;
  private readonly baseDomain: string;
  /** Product name in email copy — "Horae", or the org's own on a standalone server. */
  private readonly brandName: string;

  constructor(
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly logs: SystemLogsService,
  ) {
    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    this.baseDomain = this.config.get<string>('BASE_DOMAIN', '');
    this.brandName = this.config.get<string>('BRAND_NAME', 'Horae');
  }

  /**
   * Web origin for a given org: https://<slug>.<BASE_DOMAIN> when both are
   * known (prod/test), else the single FRONTEND_URL (local dev / legacy).
   * The linked routes (/reset-password, /accept-invite) exist on every host.
   */
  private orgUrl(orgSlug?: string): string {
    if (orgSlug && this.baseDomain) {
      return `https://${orgSlug}.${this.baseDomain}`;
    }
    return this.frontendUrl;
  }

  async sendInvitation(
    email: string,
    token: string,
    role: string,
    orgSlug?: string,
    orgName?: string,
  ): Promise<void> {
    const inviteLink = `${this.orgUrl(orgSlug)}/accept-invite?token=${token}`;
    const brand = orgName ?? this.brandName;

    await this.send('email.invitation', {
      to: email,
      subject: `Invitatie ${brand} — Creeaza-ti contul`,
      html: `
        <h2>Ai fost invitat in ${brand}</h2>
        <p>Ai primit rolul <strong>${role}</strong>.</p>
        <p>Click pe linkul de mai jos pentru a-ti crea contul:</p>
        <p><a href="${inviteLink}">${inviteLink}</a></p>
        <p>Acest link expira in 72 de ore.</p>
      `,
    });
  }

  async sendPasswordReset(email: string, token: string, orgSlug?: string): Promise<void> {
    const resetLink = `${this.orgUrl(orgSlug)}/reset-password?token=${token}`;

    await this.send('email.password-reset', {
      to: email,
      subject: `Resetare parola ${this.brandName}`,
      html: `
        <h2>Resetare parola</h2>
        <p>Ai cerut resetarea parolei. Click pe linkul de mai jos pentru a-ti seta o parola noua:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Acest link expira in 1 ora. Daca nu ai cerut tu resetarea, ignora acest email.</p>
      `,
    });
  }

  async sendReactivation(email: string, token: string, orgSlug?: string): Promise<void> {
    const resetLink = `${this.orgUrl(orgSlug)}/reset-password?token=${token}`;

    await this.send('email.reactivation', {
      to: email,
      subject: `Contul tau ${this.brandName} a fost reactivat`,
      html: `
        <h2>Cont reactivat</h2>
        <p>Contul tau a fost reactivat. Pentru securitate, trebuie sa iti setezi o parola noua:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Acest link expira in 72 de ore.</p>
      `,
    });
  }

  /**
   * Single exit point for every email: sends, then journals the outcome
   * (EMAIL category) so failed deliveries are visible in "Jurnal sistem"
   * with the SMTP reason. Re-throws so callers can react.
   */
  private async send(action: string, options: ISendMailOptions): Promise<void> {
    const to = String(options.to);
    const started = Date.now();
    try {
      await this.mailer.sendMail(options);
      this.logs.log({
        category: 'EMAIL',
        action,
        message: `Trimis către ${to}: „${options.subject}”`,
        userEmail: to,
        durationMs: Date.now() - started,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logs.log({
        category: 'EMAIL',
        action,
        level: SystemLogLevel.ERROR,
        message: `Eșec trimitere către ${to}: ${reason}`,
        userEmail: to,
        durationMs: Date.now() - started,
        metadata: { subject: options.subject, from: this.config.get<string>('SMTP_FROM') },
      });
      throw err;
    }
  }
}
