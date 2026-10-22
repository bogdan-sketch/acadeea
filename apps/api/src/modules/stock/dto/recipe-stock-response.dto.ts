import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { RecipeType, UnitType } from '@prisma/client';

export class RecipeStockResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty({ enum: RecipeType })
  type: RecipeType;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  category: string | null;

  @Expose()
  @ApiProperty({ type: [String] })
  flavors: string[];

  @Expose()
  @ApiProperty()
  stockCount: number;

  @Expose()
  @ApiProperty()
  reservedCount: number;

  @Expose()
  @ApiProperty({
    description: 'Earliest expiry among per-location stock batches (null = untracked)',
    nullable: true,
  })
  expiryDate: Date | null;

  @Expose()
  @ApiProperty({ enum: UnitType })
  unit: UnitType;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  photoUrl: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Selling price', nullable: true })
  sellingPrice: number | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Calculated cost from ingredients', nullable: true })
  calculatedCost: number | null;

  constructor(partial: Partial<RecipeStockResponseDto>) {
    Object.assign(this, partial);
  }
}
