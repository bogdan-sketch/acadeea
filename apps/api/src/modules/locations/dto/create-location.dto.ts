import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LocationType } from '@prisma/client';

export class CreateLocationDto {
  @ApiProperty({ description: 'Location name (unique)', example: 'Laborator Central' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ description: 'Location type', enum: LocationType, example: 'LABORATOR' })
  @IsEnum(LocationType)
  type: LocationType;

  @ApiProperty({ description: 'Physical address', example: 'Str. Florilor 12, Cluj-Napoca' })
  @IsString()
  @MinLength(3)
  address: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+40 744 123 456' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description:
      'Id of this location in the shop delivery plugin (Pickupia external id). Imported WooCommerce orders whose delivery method carries it become pickups from this location. Unique per organization; empty = none.',
    example: 'napoca-15',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalId?: string | null;

  @ApiPropertyOptional({
    description:
      '"Unitate principală": WooCommerce sales are deducted from stock here (the pickup location when it is one, else the first main unit)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isMainUnit?: boolean;

  @ApiPropertyOptional({ description: 'Whether location is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
