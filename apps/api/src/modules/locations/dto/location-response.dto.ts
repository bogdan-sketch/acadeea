import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { LocationType } from '@prisma/client';

export class LocationResponseDto {
  @Expose()
  @ApiProperty({ description: 'Unique identifier (UUID)' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Location name' })
  name: string;

  @Expose()
  @ApiProperty({ description: 'Location type', enum: LocationType })
  type: LocationType;

  @Expose()
  @ApiProperty({ description: 'Physical address' })
  address: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Phone number', nullable: true })
  phone: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Id in the shop delivery plugin (Pickupia external id)',
    nullable: true,
  })
  externalId: string | null;

  @Expose()
  @ApiProperty({ description: '"Unitate principală" — WooCommerce sales are deducted from here' })
  isMainUnit: boolean;

  @Expose()
  @ApiProperty({ description: 'Whether location is active' })
  isActive: boolean;

  @Expose()
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  constructor(partial: Partial<LocationResponseDto>) {
    Object.assign(this, partial);
  }
}
