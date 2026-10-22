import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { StockMovementType, UnitType } from '@prisma/client';

export class CreateRecipeMovementDto {
  @ApiProperty({ description: 'Recipe ID' })
  @IsUUID()
  recipeId: string;

  @ApiProperty({
    description: 'Movement type (INTRARE or AJUSTARE)',
    enum: [StockMovementType.INTRARE, StockMovementType.AJUSTARE],
  })
  @IsEnum(StockMovementType)
  movementType: StockMovementType;

  @ApiProperty({
    description: 'Quantity (positive; AJUSTARE accepts 0 = zero the stock)',
    example: 5,
  })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ description: 'Unit', enum: UnitType })
  @IsEnum(UnitType)
  unit: UnitType;

  @ApiPropertyOptional({ description: 'Reference note' })
  @IsOptional()
  @IsString()
  referenceNote?: string;

  @ApiPropertyOptional({
    description:
      "Location whose RecipeStock the movement lands in (defaults to the user's primary)",
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
