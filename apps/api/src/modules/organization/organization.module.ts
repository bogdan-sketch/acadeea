import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { UnitConversionsModule } from '@/modules/unit-conversions/unit-conversions.module';
import { EmailModule } from '@/modules/email';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationsAdminController } from './organizations-admin.controller';
import { OrganizationsAdminService } from './organizations-admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';

@Module({
  imports: [PrismaModule, CaslModule, UnitConversionsModule, EmailModule],
  controllers: [OrganizationController, OrganizationsAdminController],
  providers: [OrganizationService, OrganizationsAdminService, PlatformAdminGuard],
  exports: [OrganizationService],
})
export class OrganizationModule {}
