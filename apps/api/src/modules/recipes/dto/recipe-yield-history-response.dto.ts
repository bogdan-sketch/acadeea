import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class RecipeYieldHistoryResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  recipeId: string;

  @Expose()
  @ApiProperty()
  taskId: string;

  @Expose()
  @ApiProperty()
  targetQuantity: number;

  @Expose()
  @ApiProperty()
  actualYield: number;

  @Expose()
  @ApiProperty()
  varianceAbsolute: number;

  @Expose()
  @ApiProperty()
  variancePercent: number;

  @Expose()
  @ApiProperty()
  scaleFactor: number;

  @Expose()
  @ApiProperty()
  recordedAt: Date;

  constructor(partial: Partial<RecipeYieldHistoryResponseDto>) {
    Object.assign(this, partial);
  }
}
