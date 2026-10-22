// Sentry instrumentation must be imported before any other module so the SDK
// can patch the runtime. No-op when SENTRY_DSN is unset (see instrument.ts).
import './instrument';

import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { buildCorsOrigin } from './common/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Keep the exact request bytes on req.rawBody — WooCommerce webhook HMAC
    // (X-WC-Webhook-Signature) is computed over the raw body.
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Use Pino as the application logger
  app.useLogger(app.get(PinoLogger));

  // The API sits behind nginx — trust exactly one proxy hop so req.ip is the
  // real client IP (X-Forwarded-For), not nginx's. Required for per-IP rate
  // limiting (ThrottlerGuard) to see individual clients.
  app.set('trust proxy', 1);

  // Security
  app.use(helmet());

  // CORS — supports wildcard subdomain entries (https://*.horae.ca)
  const corsOrigins = configService.get<string>('CORS_ORIGINS', '*');
  app.enableCors({
    origin: buildCorsOrigin(corsOrigins),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Horae API')
    .setDescription('The Horae platform API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Start server
  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();
