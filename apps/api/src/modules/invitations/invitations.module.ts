import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { EmailModule } from '@/modules/email';
import { UsersModule } from '@/modules/users';
import { AuthModule } from '@/modules/auth';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';
import { AcceptInviteController } from './accept-invite.controller';

@Module({
  imports: [PrismaModule, CaslModule, EmailModule, UsersModule, AuthModule],
  controllers: [InvitationsController, AcceptInviteController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
