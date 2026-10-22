import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  SalesDeductionDecision,
  SalesDeductionSource,
  SalesDeductionStatus,
  UnitType,
} from '@prisma/client';

// ── Requests ─────────────────────────────────────────────────────────────

export class CreateManualSalesDeductionDto {
  @ApiProperty({ description: 'Location whose finished-goods stock is deducted' })
  @IsUUID()
  locationId: string;
}

export class CreateWooSalesDeductionDto {
  @ApiProperty({ description: 'Location whose finished-goods stock is deducted' })
  @IsUUID()
  locationId: string;

  @ApiProperty({ description: 'Orders created from (ISO date/time, inclusive)' })
  @IsDateString()
  from: string;

  @ApiProperty({ description: 'Orders created until (ISO date/time, inclusive)' })
  @IsDateString()
  to: string;
}

export class NewProductDto {
  @ApiProperty({ description: 'Name of the finished product to create' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: UnitType })
  @IsEnum(UnitType)
  unit: UnitType;

  @ApiPropertyOptional({ description: 'PRODUS_FINIT category (null = Misc)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ description: 'Quantity currently on hand at the location (>= 0)' })
  @IsNumber()
  @Min(0)
  initialStock: number;
}

export class ConfirmSalesDeductionLineDto {
  @ApiPropertyOptional({ description: 'Existing draft line id (omit for lines added by hand)' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ description: 'Name as it appears in the report (or typed by hand)' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  rawName: string;

  @ApiProperty({ enum: SalesDeductionDecision })
  @IsEnum(SalesDeductionDecision)
  decision: SalesDeductionDecision;

  @ApiPropertyOptional({ description: 'Matched product (required for ACCEPT)' })
  @IsOptional()
  @IsUUID()
  recipeId?: string;

  @ApiPropertyOptional({
    description:
      "Quantity in the product's unit. >0 = scade din stoc (vândut), <0 = adaugă înapoi (retur/corecție).",
  })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Absolute stock to leave at the location after this line (suprascriere stoc)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockOverride?: number;

  @ApiPropertyOptional({
    description: 'User confirmed selling more than is in stock — stock is clamped at 0',
  })
  @IsOptional()
  @IsBoolean()
  acceptShortfall?: boolean;

  @ApiPropertyOptional({ type: NewProductDto, description: 'Required for CREATE_NEW' })
  @IsOptional()
  @ValidateNested()
  @Type(() => NewProductDto)
  newProduct?: NewProductDto;
}

export class ConfirmSalesDeductionDto {
  @ApiProperty({ type: [ConfirmSalesDeductionLineDto] })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ConfirmSalesDeductionLineDto)
  lines: ConfirmSalesDeductionLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

// ── Responses ────────────────────────────────────────────────────────────

export class SalesProductOptionDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: UnitType }) unit: UnitType;
  @ApiProperty() type: string;
  @ApiPropertyOptional({ nullable: true }) category: string | null;
  @ApiProperty({ description: 'Stock at the requested location' }) stock: number;

  constructor(p: SalesProductOptionDto) {
    Object.assign(this, p);
  }
}

export class SalesMatchCandidateDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() score: number;
  @ApiProperty() kind: string;

  constructor(p: SalesMatchCandidateDto) {
    Object.assign(this, p);
  }
}

export class SalesDeductionLineResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() position: number;
  @ApiProperty() rawName: string;
  @ApiPropertyOptional({ nullable: true }) rawUnit: string | null;
  @ApiPropertyOptional({ nullable: true }) quantityReported: number | null;
  @ApiPropertyOptional({ nullable: true }) recipeId: string | null;
  @ApiPropertyOptional({ nullable: true }) recipeName: string | null;
  @ApiPropertyOptional({ enum: UnitType, nullable: true }) recipeUnit: UnitType | null;
  @ApiPropertyOptional({ nullable: true }) matchScore: number | null;
  @ApiPropertyOptional({ nullable: true }) matchKind: string | null;
  @ApiProperty({ enum: SalesDeductionDecision }) decision: SalesDeductionDecision;
  @ApiPropertyOptional({ nullable: true }) quantity: number | null;
  @ApiPropertyOptional({ nullable: true }) stockOverride: number | null;
  @ApiPropertyOptional({ nullable: true }) shortfall: number | null;
  @ApiPropertyOptional({ nullable: true }) stockBefore: number | null;
  @ApiPropertyOptional({ nullable: true }) stockAfter: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'DRAFT only: live stock of the matched product at the location',
  })
  currentStock: number | null;
  @ApiProperty({ type: [SalesMatchCandidateDto], description: 'DRAFT only: best name matches' })
  candidates: SalesMatchCandidateDto[];

  constructor(p: SalesDeductionLineResponseDto) {
    Object.assign(this, p);
  }
}

export class SalesDeductionSummaryDto {
  @ApiProperty() total: number;
  @ApiProperty() accepted: number;
  @ApiProperty() declined: number;
  @ApiProperty() created: number;
  @ApiProperty() shortfalls: number;
  @ApiProperty() overrides: number;
  @ApiProperty() unmatched: number;

  constructor(p: SalesDeductionSummaryDto) {
    Object.assign(this, p);
  }
}

export class SalesDeductionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() locationId: string;
  @ApiProperty() locationName: string;
  @ApiProperty({ enum: SalesDeductionSource }) source: SalesDeductionSource;
  @ApiProperty({ enum: SalesDeductionStatus }) status: SalesDeductionStatus;
  @ApiPropertyOptional({ nullable: true }) fileName: string | null;
  @ApiPropertyOptional({ nullable: true }) periodFrom: Date | null;
  @ApiPropertyOptional({ nullable: true }) periodTo: Date | null;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty() createdByName: string;
  @ApiPropertyOptional({ nullable: true }) confirmedByName: string | null;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({ nullable: true }) confirmedAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) revertedAt: Date | null;
  @ApiProperty({
    type: [String],
    description: 'Earlier CONFIRMED sessions built from the same file (same sha256)',
  })
  duplicateOf: string[];
  @ApiProperty({ type: SalesDeductionSummaryDto }) summary: SalesDeductionSummaryDto;
  @ApiPropertyOptional({ type: [SalesDeductionLineResponseDto] })
  lines?: SalesDeductionLineResponseDto[];

  constructor(p: SalesDeductionResponseDto) {
    Object.assign(this, p);
  }
}
