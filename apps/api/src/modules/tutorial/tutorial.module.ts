import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { TUTORIAL_FLOWS } from './tutorial.data';

/**
 * Public (unauthenticated) read-only tutorial content. Content lives in
 * tutorial.data.ts (curated, Romanian). Consumed by every client's help
 * center + contextual-hint engine. Tutorial mode is a per-user client-local
 * preference, not an org setting — this endpoint has no gate, same posture
 * as /changelog.
 */
@ApiTags('Tutorial')
@Controller('api/v1/tutorial')
class TutorialController {
  @Get('content')
  @ApiOperation({ summary: 'Tutorial content — help center + coachmark flows (public)' })
  content() {
    return { flows: TUTORIAL_FLOWS };
  }
}

@Module({ controllers: [TutorialController] })
export class TutorialModule {}
