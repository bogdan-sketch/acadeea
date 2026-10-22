/**
 * Shared e2e bootstrap: boots the real AppModule exactly like main.ts
 * (global ValidationPipe, trust proxy), with the outbound EmailService
 * replaced by an in-memory capture so invitation / reset tokens can be read
 * back by the tests and nothing ever leaves the machine.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { EmailService } from '../../src/modules/email/email.service';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface SentMail {
  kind: 'invitation' | 'reset' | 'reactivation';
  email: string;
  token: string;
  args: unknown[];
}

export class EmailCapture {
  sent: SentMail[] = [];
  async sendInvitation(email: string, token: string, ...rest: unknown[]) {
    this.sent.push({ kind: 'invitation', email, token, args: rest });
  }
  async sendPasswordReset(email: string, token: string, ...rest: unknown[]) {
    this.sent.push({ kind: 'reset', email, token, args: rest });
  }
  async sendReactivation(email: string, token: string, ...rest: unknown[]) {
    this.sent.push({ kind: 'reactivation', email, token, args: rest });
  }
  last(kind: SentMail['kind'], email?: string): SentMail | undefined {
    return [...this.sent].reverse().find((m) => m.kind === kind && (!email || m.email === email));
  }
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http: any;
  mail: EmailCapture;
  close: () => Promise<void>;
}

export async function bootApp(): Promise<TestApp> {
  const mail = new EmailCapture();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailService)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication({
    logger: ['error'],
    // Same as main.ts — WooCommerce webhook HMAC needs the raw body.
    rawBody: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).getHttpAdapter().getInstance().set('trust proxy', 1);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  const prisma = app.get(PrismaService);
  const http = request(app.getHttpServer());
  return { app, prisma, http, mail, close: () => app.close() };
}
