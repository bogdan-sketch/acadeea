import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ExternalOrderResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  integrationId: string;

  @Expose()
  @ApiProperty()
  externalId: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  orderId: string | null;

  @Expose()
  @ApiProperty({ description: 'Sync status', example: 'PENDING' })
  syncStatus: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  errorMessage: string | null;

  @Expose()
  @ApiProperty()
  createdAt: string;

  constructor(partial: Partial<ExternalOrderResponseDto>) {
    Object.assign(this, partial);
  }
}
