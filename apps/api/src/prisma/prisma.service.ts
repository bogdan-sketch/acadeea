import { Injectable, OnModuleInit, INestApplication, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { tenantExtension } from './tenant.extension';

/**
 * PrismaService = PrismaClient + the tenant-isolation extension
 * (src/prisma/tenant.extension.ts).
 *
 * `$extends` returns a NEW client object rather than mutating the class, so a
 * plain `class extends PrismaClient` can't carry the extension. The
 * constructor-return trick below makes `new PrismaService()` yield the
 * extended client while keeping the `PrismaService` DI token and the exact
 * `this.prisma.<model>.*` call-site surface every service already uses.
 */

function createExtendedClient() {
  return new PrismaClient().$extends(tenantExtension);
}

export type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

const ExtendedPrismaClientCtor = class {
  constructor() {
    return createExtendedClient();
  }
} as new () => ExtendedPrismaClient;

@Injectable()
export class PrismaService extends ExtendedPrismaClientCtor implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
