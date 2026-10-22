import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsUUID, Min, ValidateNested } from 'class-validator';

export class RequirementsPlanItemDto {
  @ApiProperty({ description: 'Recipe (product) to produce' })
  @IsUUID()
  recipeId: string;

  @ApiProperty({ description: "Quantity to produce, in the recipe's own unit", example: 200 })
  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class RequirementsPlanDto {
  @ApiProperty({ type: [RequirementsPlanItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequirementsPlanItemDto)
  items: RequirementsPlanItemDto[];
}

export class PlanProductDto {
  @ApiProperty()
  recipeId: string;

  @ApiProperty()
  recipeName: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  unit: string;

  constructor(partial: Partial<PlanProductDto>) {
    Object.assign(this, partial);
  }
}

export class PlanRequirementDto {
  @ApiProperty()
  rawMaterialId: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  category: string | null;

  @ApiProperty({ description: "Aggregated quantity needed, in the material's stock unit" })
  needed: number;

  @ApiProperty()
  unit: string;

  @ApiProperty({ description: 'Physical stock right now (all locations)' })
  currentStock: number;

  @ApiProperty({ description: 'Unreserved stock (currentStock − reserved)' })
  available: number;

  @ApiProperty({ description: 'max(0, needed − available) — what must be bought' })
  deficit: number;

  @ApiPropertyOptional({ nullable: true })
  supplierId: string | null;

  @ApiPropertyOptional({ nullable: true })
  supplierName: string | null;

  constructor(partial: Partial<PlanRequirementDto>) {
    Object.assign(this, partial);
  }
}

export class RequirementsPlanResponseDto {
  @ApiProperty({ type: [PlanProductDto] })
  products: PlanProductDto[];

  @ApiProperty({ type: [PlanRequirementDto] })
  requirements: PlanRequirementDto[];

  constructor(partial: Partial<RequirementsPlanResponseDto>) {
    Object.assign(this, partial);
  }
}
