import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { IntegrationProvider } from '@prisma/client';

export class CreateIntegrationDto {
  @ApiProperty({
    description: 'Integration provider',
    enum: IntegrationProvider,
    example: 'EBRIZA',
  })
  @IsEnum(IntegrationProvider)
  provider: IntegrationProvider;

  @ApiPropertyOptional({
    description: 'Provider-specific configuration',
    example: { apiKey: 'xxx', storeId: '123' },
  })
  @IsOptional()
  @IsObject()
  config?: object;
}
