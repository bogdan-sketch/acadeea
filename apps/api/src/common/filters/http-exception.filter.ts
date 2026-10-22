import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = (request.headers['x-correlation-id'] as string) || 'unknown';

    let statusCode: number;
    let message: string;
    let errorCode: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        errorCode = HttpStatus[statusCode] || 'UNKNOWN_ERROR';
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = Array.isArray(resp.message)
          ? resp.message.join(', ')
          : (resp.message as string) || exception.message;
        errorCode = (resp.errorCode as string) || HttpStatus[statusCode] || 'UNKNOWN_ERROR';
      } else {
        message = exception.message;
        errorCode = HttpStatus[statusCode] || 'UNKNOWN_ERROR';
      }
    } else if (prismaClientError(exception)) {
      // Bad client input that slipped past the DTOs and reached the DB layer
      // (unknown foreign id, duplicate unique value, invalid Date/enum) is a
      // 4xx, not a 500. Still logged — a mapping here can hide a real bug.
      ({ statusCode, message, errorCode } = prismaClientError(exception) as PrismaMapped);
      this.logger.warn(
        `Prisma client error mapped to ${statusCode}: ${(exception as Error).message.split('\n').slice(-3).join(' ')}`,
      );
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      errorCode = 'INTERNAL_SERVER_ERROR';

      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Report server-side failures (5xx) to Sentry; client errors (4xx) are
    // expected validation/permission failures and stay out of Sentry. No-op
    // when SENTRY_DSN is unset (Sentry was never initialised).
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      Sentry.captureException(exception, {
        tags: { correlationId },
        contexts: {
          request: { method: request.method, url: request.url },
        },
      });
    }

    // Picked up by the SystemLog request middleware on `finish`.
    response.locals.errorMessage = message;

    const errorResponse = {
      statusCode,
      errorCode,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
    };

    this.logger.warn(
      `[${correlationId}] ${request.method} ${request.url} ${statusCode} - ${message}`,
    );

    response.status(statusCode).json(errorResponse);
  }
}

interface PrismaMapped {
  statusCode: number;
  message: string;
  errorCode: string;
}

/** Map Prisma errors caused by client input to a 4xx; null = a real 500. */
function prismaClientError(exception: unknown): PrismaMapped | null {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | string | undefined) ?? [];
        const fields = (Array.isArray(target) ? target : [target])
          .filter((f) => f !== 'organizationId')
          .join(', ');
        return {
          statusCode: HttpStatus.CONFLICT,
          errorCode: 'DUPLICATE',
          message: `Există deja o înregistrare cu aceeași valoare${fields ? ` (${fields})` : ''}.`,
        };
      }
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          errorCode: 'INVALID_REFERENCE',
          message: 'O referință trimisă (id) nu există sau nu aparține organizației.',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          errorCode: 'NOT_FOUND',
          message: 'Înregistrarea nu a fost găsită.',
        };
      default:
        return null;
    }
  }
  if (exception instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'BAD_REQUEST',
      message: 'Date invalide în cerere (dată, valoare sau filtru necunoscut).',
    };
  }
  return null;
}
