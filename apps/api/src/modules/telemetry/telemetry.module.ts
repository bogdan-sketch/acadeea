import { Global, Module } from '@nestjs/common';
import { PostHogService } from './posthog.service';

/**
 * Global module exposing {@link PostHogService} for backend product analytics.
 * Global so any feature module can inject the service without re-importing.
 */
@Global()
@Module({
  providers: [PostHogService],
  exports: [PostHogService],
})
export class TelemetryModule {}
