import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType } from '@prisma/client';

export class TransferItemDto {
  @ApiPropertyOptional({ description: 'Raw material ID (XOR with recipeId)' })
  @IsOptional()
  @IsUUID()
  rawMaterialId?: string;

  @ApiPropertyOptional({
    description: 'Recipe ID — finished good / semipreparat (XOR with rawMaterialId)',
  })
  @IsOptional()
  @IsUUID()
  recipeId?: string;

  @ApiProperty({ description: 'Quantity to transfer', example: 5 })
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiPropertyOptional({
    description: "Ignored — the server uses the material's stock unit.",
    enum: UnitType,
  })
  @IsOptional()
  @IsEnum(UnitType)
  unit?: UnitType;
}

export class CreateTransferDto {
  @ApiProperty({ description: 'Source location ID (UUID)' })
  @IsUUID()
  fromLocationId: string;

  @ApiPropertyOptional({
    description:
      'Destination location ID (UUID). XOR with destinationName — omit for an ad-hoc destination.',
  })
  @IsOptional()
  @IsUUID()
  toLocationId?: string;

  @ApiPropertyOptional({
    description:
      'Ad-hoc destination name (e.g. an event) — goods leave the system on completion. XOR with toLocationId.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destinationName?: string;

  @ApiPropertyOptional({ description: 'Ad-hoc destination address', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  destinationAddress?: string;

  @ApiPropertyOptional({
    description: 'Recipient (person) at the destination — printed on the aviz.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destinationContact?: string;

  @ApiPropertyOptional({ description: 'Notes for the transfer' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'User who carries out the transport (UUID)' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Delegate ID card (serie + numar) — printed on the aviz' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  delegateIdCard?: string;

  @ApiPropertyOptional({ description: 'Means of transport (mijloc de transport)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transportMeans?: string;

  @ApiPropertyOptional({ description: 'Dispatch time (ora expeditiei), ISO 8601' })
  @IsOptional()
  @IsDateString()
  dispatchedAt?: string;

  @ApiProperty({ description: 'Items to transfer', type: [TransferItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];
}
