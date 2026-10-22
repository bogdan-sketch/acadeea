import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaterialStatus } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ConsumableResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Consumable unique identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @Expose()
  @ApiProperty({
    description: 'Name of the consumable item',
    example: 'Cutie tort 30cm',
  })
  title: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Admin-managed product category (null = Misc)',
    nullable: true,
  })
  category: string | null;

  @Expose()
  @ApiProperty({
    description: 'Current stock count',
    example: 100,
  })
  stockCount: number;

  @Expose()
  @ApiProperty({
    description: 'Number of units currently on order',
    example: 50,
  })
  orderedCount: number;

  @Expose()
  @ApiProperty({
    description: 'Number of units reserved for tasks',
    example: 20,
  })
  reservedCount: number;

  @Expose()
  @ApiProperty({
    description: 'Current status of the consumable',
    enum: MaterialStatus,
    example: MaterialStatus.ACTIVE,
  })
  status: MaterialStatus;

  @Expose()
  @ApiProperty({
    description: 'Minimum stock threshold before LOW_STOCK warning',
    example: 10,
  })
  minimumStock: number;

  @Expose()
  @ApiProperty({
    description: 'Record creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @Expose()
  @ApiProperty({
    description: 'Record last update timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt: Date;

  constructor(partial: Partial<ConsumableResponseDto>) {
    Object.assign(this, partial);
  }
}
