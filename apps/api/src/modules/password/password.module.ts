import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { EmailModule } from '@/modules/email';
import { PasswordService } from './password.service';
import { PasswordController } from './password.controller';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [PasswordController],
  providers: [PasswordService],
  exports: [PasswordService],
})
export class PasswordModule {}
