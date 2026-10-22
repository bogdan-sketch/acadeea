import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { EquipmentType, EquipmentStatus } from '@prisma/client';

export class CreateEquipmentDto {
  @ApiProperty({ description: 'Equipment name', example: 'Mixer KitchenAid 5L' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ description: 'Equipment type', enum: EquipmentType, example: 'MIXER' })
  @IsEnum(EquipmentType)
  type: EquipmentType;

  @ApiPropertyOptional({ description: 'Quantity available', default: 1, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Location ID (UUID)', example: null })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({
    description: 'Equipment status',
    enum: EquipmentStatus,
    default: 'DISPONIBIL',
  })
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @ApiPropertyOptional({ description: 'Purchase date (ISO 8601)', example: '2024-01-15' })
  @IsOptional()
  @IsISO8601()
  purchaseDate?: string;

  @ApiPropertyOptional({ description: 'Warranty expiry date (ISO 8601)', example: '2026-01-15' })
  @IsOptional()
  @IsISO8601()
  warrantyExpiry?: string;

  @ApiPropertyOptional({ description: 'Additional notes', example: 'Bought from supplier X' })
  @IsOptional()
  @IsString()
  notes?: string;
}
