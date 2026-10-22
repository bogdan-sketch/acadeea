import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { UnitType } from '@prisma/client';

export class LocationStockResponseDto {
  @Expose()
  @ApiProperty({ description: 'MaterialStock record ID' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Location ID' })
  locationId: string;

  @Expose()
  @ApiProperty({ description: 'Raw material ID' })
  rawMaterialId: string;

  @Expose()
  @ApiProperty({ description: 'Raw material title' })
  rawMaterialTitle: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Product category of the material (null = Misc)',
    nullable: true,
  })
  category: string | null;

  @Expose()
  @ApiProperty({ description: 'Unit of measurement', enum: UnitType })
  unit: UnitType;

  @Expose()
  @ApiProperty({ description: 'Quantity at this location' })
  quantity: number;

  @Expose()
  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  constructor(partial: Partial<LocationStockResponseDto>) {
    Object.assign(this, partial);
  }
}
