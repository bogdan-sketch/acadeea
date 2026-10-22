import { Injectable, NestMiddleware } from '@nestjs/common';
import { SystemLogLevel } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';

import { SystemLogCategory, SystemLogsService } from './system-logs.service';

interface AuthedUser {
  userId?: string;
  email?: string;
  organizationId?: string;
}

/** Paths never worth a journal row (docs, the journal itself, liveness). */
const SKIP = [/^\/api\/docs/, /^\/api\/v1\/system-logs/, /^\/health/, /^\/favicon/];

/**
 * Journals every API request that CHANGES something (non-GET) plus every
 * failed request (4xx/5xx, any method) into SystemLog — who, org, route,
 * status, duration, error message, sanitized params/query/body. Successful
 * reads are left to the pino access log (polling would drown the journal).
 *
 * Runs as Express middleware and records on `finish`, so it also sees
 * requests rejected by guards (401/403) and routing (404). The user comes
 * from `req.user` (set by JwtAuthGuard later in the same request), the
 * error text from `res.locals.errorMessage` (set by HttpExceptionFilter).
 */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  constructor(private readonly logs: SystemLogsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const started = Date.now();
    const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
    if (req.method === 'OPTIONS' || SKIP.some((re) => re.test(path))) return next();

    res.on('finish', () => {
      const status = res.statusCode;
      const isRead = req.method === 'GET' || req.method === 'HEAD';
      if (isRead && status < 400) return;

      const isAuthRoute = path.startsWith('/api/v1/auth');
      // An expired access token on a normal call is routine (the client
      // refreshes) — only auth-route 401s are interesting.
      if (status === 401 && !isAuthRoute) return;

      const user = (req as Request & { user?: AuthedUser }).user;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const category: SystemLogCategory = isAuthRoute
        ? 'AUTH'
        : /\/integrations\/.*webhook/.test(path)
          ? 'INTEGRATION'
          : 'HTTP';
      const level =
        status >= 500
          ? SystemLogLevel.ERROR
          : status >= 400
            ? SystemLogLevel.WARN
            : SystemLogLevel.INFO;
      // Route pattern (":id") groups the same action across ids.
      const route = (req.route?.path as string | undefined) ?? path;
      const errorMessage = res.locals?.errorMessage as string | undefined;

      this.logs.log({
        category,
        action: `${req.method} ${route.replace(/^\/api\/v1/, '')}`,
        message: errorMessage ?? `${req.method} ${path} → ${status}`,
        level,
        organizationId: user?.organizationId ?? null,
        userId: user?.userId ?? null,
        userEmail: user?.email ?? (typeof body.email === 'string' ? body.email : null),
        method: req.method,
        path,
        statusCode: status,
        durationMs: Date.now() - started,
        correlationId: (req.headers['x-correlation-id'] as string | undefined) ?? undefined,
        ip: req.ip,
        metadata: {
          params: req.params && Object.keys(req.params).length ? req.params : undefined,
          query: Object.keys(req.query ?? {}).length ? req.query : undefined,
          body: !isRead && Object.keys(body).length ? body : undefined,
          userAgent: req.headers['user-agent'],
        },
      });
    });
    next();
  }
}
