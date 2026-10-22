import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { AppModule } from '../src/app.module';

async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Horae API')
    .setDescription('The Horae platform API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outDir = path.resolve(__dirname, '../../../docs/openapi');
  fs.mkdirSync(outDir, { recursive: true });

  // JSON for tooling
  fs.writeFileSync(path.join(outDir, 'acadeea-api.json'), JSON.stringify(document, null, 2));

  // YAML for git diffing
  fs.writeFileSync(
    path.join(outDir, 'acadeea-api.yaml'),
    yaml.dump(document, { lineWidth: 120, noRefs: true }),
  );

  console.log(`OpenAPI spec exported to ${outDir}`);
  await app.close();
}

exportOpenApi();
