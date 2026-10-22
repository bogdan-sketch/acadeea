/**
 * Bootstrap a single administrator account on a clean database via the invitation
 * flow — no plaintext password is ever stored. The invitee sets their own password
 * (argon2-hashed) by following the emailed link.
 *
 * Run inside the API container after roles are seeded:
 *   BOOTSTRAP_ADMIN_EMAIL=sergiu@tigan.dev node dist/prisma/invite-admin.js
 *
 * Idempotent: if a pending invitation for the email already exists, it resends that
 * one instead of creating a duplicate. Aborts if an active user already owns the email.
 */
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as nodemailer from 'nodemailer';

const INVITE_EXPIRY_MS = 72 * 60 * 60 * 1000;

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!email) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL is required');
  }

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const prisma = new PrismaClient();

  try {
    // Administrator role must exist (run the seed first).
    const role = await prisma.role.findFirst({ where: { slug: 'administrator' } });
    if (!role) {
      throw new Error('Role "administrator" not found — run the seed before this script');
    }

    // Don't shadow an existing active account.
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser && existingUser.isActive) {
      console.log(`Active user "${email}" already exists — nothing to do.`);
      return;
    }

    // Reuse a still-valid pending invitation, otherwise create a fresh one.
    let invitation = await prisma.userInvitation.findFirst({
      where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });

    if (invitation) {
      console.log(
        `Reusing pending invitation for ${email} (expires ${invitation.expiresAt.toISOString()}).`,
      );
    } else {
      invitation = await prisma.userInvitation.create({
        data: {
          email,
          role: 'ADMINISTRATOR', // legacy enum field; real role is roleId/dynamicRole
          roleId: role.id,
          token: uuidv4(),
          // createdById omitted → null (system-generated bootstrap invitation)
          expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
        },
      });
      console.log(`Created invitation for ${email} with role ${role.name}.`);
    }

    const inviteLink = `${frontendUrl}/accept-invite?token=${invitation.token}`;

    // Send via SMTP (same config the app uses).
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '' },
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM ?? '"Horae" <noreply@acadeea.ro>',
      to: email,
      subject: 'Invitatie Horae — Creeaza-ti contul de administrator',
      html: `
        <h2>Ai fost invitat in Horae</h2>
        <p>Ai primit rolul <strong>${role.name}</strong>.</p>
        <p>Click pe linkul de mai jos pentru a-ti crea contul si a-ti seta parola:</p>
        <p><a href="${inviteLink}">${inviteLink}</a></p>
        <p>Acest link expira in 72 de ore.</p>
      `,
    });

    console.log(`Invitation email sent to ${email}.`);
    console.log(`Link: ${inviteLink}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
