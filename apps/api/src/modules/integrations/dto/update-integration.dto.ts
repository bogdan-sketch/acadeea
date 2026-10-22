import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateIntegrationDto {
  @ApiPropertyOptional({
    description: 'Integration status',
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Provider-specific configuration',
    example: { apiKey: 'xxx', storeId: '123' },
  })
  @IsOptional()
  @IsObject()
  config?: object;
}
