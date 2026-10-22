import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import * as Joi from 'joi';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth';
import { UsersModule } from './modules/users';
import { WebsocketModule } from './modules/websocket';
import { ConsumablesModule } from './modules/consumables';
import { RawMaterialsModule } from './modules/raw-materials';
import { SuppliersModule } from './modules/suppliers';
import { RecipesModule } from './modules/recipes';
import { UnitConversionsModule } from './modules/unit-conversions';
import { TasksModule } from './modules/tasks';
import { StockModule } from './modules/stock';
import { EmailModule } from './modules/email';
import { PasswordModule } from './modules/password';
import { InvitationsModule } from './modules/invitations';
import { OrdersModule } from './modules/orders';
import { ActivityModule } from './modules/activity';
import { LocationsModule } from './modules/locations';
import { OrganizationModule } from './modules/organization';
import { EquipmentModule } from './modules/equipment';
import { PricingModule } from '@/modules/pricing';
import { AnalyticsModule } from '@/modules/analytics';
import { IntegrationsModule } from './modules/integrations';
import { ImagesModule } from './modules/images';
import { DashboardModule } from './modules/dashboard';
import { NotificationsModule } from './modules/notifications';
import { RolesModule } from './modules/roles';
import { TelemetryModule } from './modules/telemetry';
import { DesignFeedbackModule } from './modules/design-feedback/design-feedback.module';
import { ChangelogModule } from './modules/changelog/changelog.module';
import { TutorialModule } from './modules/tutorial/tutorial.module';
import { BackupModule } from './modules/backup/backup.module';
import { BackupsModule } from './modules/backups/backups.module';
import { DataResetModule } from './modules/data-reset/data-reset.module';
import { BulkActionsModule } from './modules/bulk-actions/bulk-actions.module';
import { SalesDeductionsModule } from './modules/sales-deductions';
import { SystemLogsModule } from './modules/system-logs';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';

@Module({
  imports: [
    // Sentry NestJS integration (error + performance monitoring).
    // No-op at runtime when SENTRY_DSN is unset (see src/instrument.ts).
    SentryModule.forRoot(),

    // Cron scheduling (expiry-notification job lives in NotificationsModule).
    ScheduleModule.forRoot(),

    // Bulk delete routes (`<resource>/bulk-delete[/preview]`) are literal paths that
    // must be registered before the resource controllers' `:id` routes.
    BulkActionsModule,

    // Rate limiting — global default: 600 requests / 60s per client IP
    // (req.ip is the real client thanks to `trust proxy` in main.ts; the API
    // sits behind nginx). A whole shop shares one IP behind NAT and the web
    // app polls notifications, so 120/min kicked real users out mid-form
    // (QA 17.10.2026). Auth endpoints carry a stricter @Throttle override
    // (10 / 60s) on their controller methods. Socket.IO handshakes are NOT
    // affected: engine.io attaches at the HTTP-server level (/socket.io/*)
    // and never enters Nest routing, so the guard can't see them.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 600,
      },
    ]),

    // Configuration with validation
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        JWT_PRIVATE_KEY_PATH: Joi.string().required(),
        JWT_PUBLIC_KEY_PATH: Joi.string().required(),
        JWT_ACCESS_EXPIRY: Joi.string().default('12h'),
        JWT_REFRESH_EXPIRY: Joi.string().default('30d'),
        S3_ENDPOINT: Joi.string().required(),
        S3_BUCKET: Joi.string().required(),
        S3_ACCESS_KEY: Joi.string().required(),
        S3_SECRET_KEY: Joi.string().required(),
        CORS_ORIGINS: Joi.string().default('*'),
        SMTP_HOST: Joi.string().default('localhost'),
        SMTP_PORT: Joi.number().default(587),
        SMTP_USER: Joi.string().default(''),
        SMTP_PASS: Joi.string().default(''),
        SMTP_FROM: Joi.string().default('"Horae" <noreply@horae.ca>'),
        FRONTEND_URL: Joi.string().default('http://localhost:3000'),
        BRAND_NAME: Joi.string().default('Horae'), // email copy; 'Acadeea' on the standalone server
        // Multi-tenancy
        TENANT_ENFORCEMENT: Joi.string().valid('off', 'warn', 'strict').default('warn'),
        BASE_DOMAIN: Joi.string().allow('').default(''), // e.g. horae.ca — org links become https://<slug>.<BASE_DOMAIN>
        PLATFORM_ADMIN_EMAILS: Joi.string().allow('').default(''), // comma list — may manage organizations
        // Comma list of emails allowed to DOWNLOAD org snapshots (backups module
        // has its own fallback default when unset/empty).
        BACKUP_ADMIN_EMAILS: Joi.string().allow('').optional(),
        // Social sign-in (Apple / Google) — comma lists of allowed audiences (client
        // ids / bundle ids / Services IDs). Empty = that provider is disabled.
        APPLE_AUDIENCES: Joi.string().allow('').default(''), // e.g. ca.horae.app,ca.horae.app.test,ca.horae.signin
        GOOGLE_AUDIENCES: Joi.string().allow('').default(''), // web + iOS OAuth client ids
        // Observability — all optional so missing values never crash boot.
        SENTRY_DSN: Joi.string().allow('').optional(),
        SENTRY_ENVIRONMENT: Joi.string().allow('').optional(),
        POSTHOG_API_KEY: Joi.string().allow('').optional(),
        POSTHOG_HOST: Joi.string().allow('').optional(),
      }),
      validationOptions: {
        abortEarly: false,
      },
    }),

    // Structured logging
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        autoLogging: true,
        redact: ['req.headers.authorization'],
        // Compact access log: no full header dump (it tripled log volume);
        // who/which org is added per request instead.
        serializers: {
          req: (req: { id: unknown; method: string; url: string; remoteAddress?: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            ip: req.remoteAddress,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
        customProps: (req) => {
          const user = (
            req as { user?: { userId?: string; email?: string; organizationId?: string } }
          ).user;
          return user ? { userId: user.userId, user: user.email, org: user.organizationId } : {};
        },
      },
    }),

    // Database
    PrismaModule,

    // Jurnal sistem (durable activity/ops log) — global, request middleware.
    SystemLogsModule,

    // Auth
    AuthModule,

    // Users
    UsersModule,

    // Consumables inventory
    ConsumablesModule,

    // Raw materials inventory
    RawMaterialsModule,
    SuppliersModule,

    // Recipes (final products & semi-prepared items)
    RecipesModule,

    // Unit conversions (mass, volume, density-based)
    UnitConversionsModule,

    // Production tasks (assignments, state machine)
    TasksModule,

    // Stock management (movements, reservations)
    StockModule,
    // Scădere stoc din vânzări (eBriza Excel / manual / WooCommerce) — test-env gated.
    SalesDeductionsModule,

    // Email (SMTP transport)
    EmailModule,

    // Password reset / reactivation
    PasswordModule,

    // User invitations
    InvitationsModule,

    // Orders (customer orders, delivery notes)
    OrdersModule,

    // Activity feed (aggregated events)
    ActivityModule,

    // Locations & stock transfers
    LocationsModule,

    // Organization branding (white-label)
    OrganizationModule,

    // Equipment management & maintenance
    EquipmentModule,

    // Pricing & margin analysis
    PricingModule,

    // Analytics & reporting
    AnalyticsModule,

    // External integrations (eBriza, WooCommerce)
    IntegrationsModule,

    // Dashboard (consolidated stats)
    DashboardModule,

    // Push notifications & device tokens
    NotificationsModule,

    // Dynamic RBAC roles
    RolesModule,

    // WebSocket real-time events
    WebsocketModule,

    // PostHog backend product analytics (global; no-op without POSTHOG_API_KEY)
    TelemetryModule,
    DesignFeedbackModule,
    ChangelogModule,
    TutorialModule,

    // Database backups (daily automatic + manual export/import; admin-only)
    BackupModule,

    // Org snapshots — per-tenant logical backups ("Salvează starea")
    BackupsModule,
    DataResetModule,
    ImagesModule,
  ],
  providers: [
    // Global rate limiting (per-IP, config in ThrottlerModule above)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global correlation ID interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
    // Tenant context — wraps every authenticated request in the org's
    // AsyncLocalStorage scope (guards run before interceptors, so
    // request.user is already populated). The Prisma tenant extension reads it.
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
