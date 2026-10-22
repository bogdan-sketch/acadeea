import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class IntegrationResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty({ description: 'Integration provider', example: 'EBRIZA' })
  provider: string;

  @Expose()
  @ApiProperty({ description: 'Integration status', example: 'ACTIVE' })
  status: string;

  @Expose()
  @ApiProperty({ description: 'Provider-specific configuration' })
  config: Record<string, any>;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  lastSyncAt: string | null;

  @Expose()
  @ApiProperty()
  createdAt: string;

  @Expose()
  @ApiProperty()
  updatedAt: string;

  @Expose()
  @ApiProperty({ description: 'Number of product mappings' })
  mappingsCount: number;

  constructor(partial: Partial<IntegrationResponseDto>) {
    Object.assign(this, partial);
  }
}
