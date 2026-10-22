import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { StockMovementType, UnitType } from '@prisma/client';

export class StockMovementResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Unique identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Raw material ID',
    nullable: true,
  })
  rawMaterialId: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Consumable ID',
    nullable: true,
  })
  consumableId: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Recipe ID',
    nullable: true,
  })
  recipeId: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Name of the moved item (raw material / consumable / recipe)',
    nullable: true,
  })
  itemTitle: string | null;

  @Expose()
  @ApiProperty({
    description: 'Type of stock movement',
    enum: StockMovementType,
  })
  movementType: StockMovementType;

  @Expose()
  @ApiProperty({
    description: 'Quantity moved',
    example: 10,
  })
  quantity: number;

  @Expose()
  @ApiProperty({
    description: 'Unit of measurement',
    enum: UnitType,
  })
  unit: UnitType;

  @Expose()
  @ApiPropertyOptional({
    description: 'Associated task ID',
    nullable: true,
  })
  taskId: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Reference note',
    nullable: true,
  })
  referenceNote: string | null;

  @Expose()
  @ApiProperty({
    description: 'User ID who performed the movement',
  })
  performedById: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Full name of the user who performed the movement',
    nullable: true,
  })
  createdByName: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Name of the location the movement landed in',
    nullable: true,
  })
  locationName: string | null;

  @Expose()
  @ApiProperty({
    description: 'Creation timestamp',
  })
  createdAt: Date;

  constructor(partial: Partial<StockMovementResponseDto>) {
    Object.assign(this, partial);
  }
}
