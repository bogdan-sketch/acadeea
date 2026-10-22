import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType } from '@prisma/client';

/**
 * Query for previewing a recipe's scaled material requirements before a task
 * exists — used by the task-create form to recompute stock as the user edits
 * the target quantity.
 */
export class PreviewRequirementsQueryDto {
  @ApiProperty({ description: 'Recipe to scale', format: 'uuid' })
  @IsUUID()
  recipeId: string;

  @ApiProperty({ description: 'Target quantity to produce', example: 200 })
  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  targetQuantity: number;

  @ApiProperty({ description: 'Unit of the target quantity', enum: UnitType, example: 'BUCATI' })
  @IsEnum(UnitType)
  targetUnit: UnitType;

  @ApiPropertyOptional({
    description: 'Production location to check stock against. Defaults to the default location.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
