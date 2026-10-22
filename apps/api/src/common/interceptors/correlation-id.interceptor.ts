import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  private static readonly HEADER_NAME = 'X-Correlation-ID';

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    // Use existing correlation ID from incoming request or generate a new one
    const correlationId = (request.headers['x-correlation-id'] as string) || uuidv4();

    // Attach to request headers so downstream services and filters can access it
    request.headers['x-correlation-id'] = correlationId;

    // Include in response headers
    response.setHeader(CorrelationIdInterceptor.HEADER_NAME, correlationId);

    return next.handle();
  }
}
