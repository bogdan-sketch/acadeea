import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EquipmentType, EquipmentStatus } from '@prisma/client';

export class EquipmentQueryDto {
  @ApiPropertyOptional({ description: 'Filter by equipment type', enum: EquipmentType })
  @IsOptional()
  @IsEnum(EquipmentType)
  type?: EquipmentType;

  @ApiPropertyOptional({ description: 'Filter by equipment status', enum: EquipmentStatus })
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @ApiPropertyOptional({ description: 'Filter by location ID' })
  @IsOptional()
  @IsString()
  locationId?: string;
}
