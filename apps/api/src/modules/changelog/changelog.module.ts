import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CHANGELOG } from './changelog.data';

/**
 * Public (unauthenticated) read-only changelog. Content lives in
 * changelog.data.ts (curated, Romanian). Consumed by the web /changelog page
 * and the iOS "Noutăți" screen — both shown only on the test environment,
 * but the endpoint itself is harmless everywhere.
 */
@ApiTags('Changelog')
@Controller('api/v1/changelog')
class ChangelogController {
  @Get()
  @ApiOperation({ summary: 'Application changelog (public)' })
  list() {
    return {
      currentVersion: CHANGELOG[0]?.version ?? '0.0.0',
      entries: CHANGELOG,
    };
  }
}

@Module({ controllers: [ChangelogController] })
export class ChangelogModule {}
