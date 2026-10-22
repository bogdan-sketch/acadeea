import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { StorageType, MaterialStatus, PieceType } from '@prisma/client';

export class RawMaterialQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Search term — filters by title (case-insensitive)',
    example: 'faina',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by storage type',
    enum: StorageType,
    example: 'DRY',
  })
  @IsOptional()
  @IsEnum(StorageType)
  storageType?: StorageType;

  @ApiPropertyOptional({
    description: 'Filter by material status',
    enum: MaterialStatus,
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(MaterialStatus)
  status?: MaterialStatus;

  @ApiPropertyOptional({
    description: 'Filter by piece type',
    enum: PieceType,
    example: 'BAG',
  })
  @IsOptional()
  @IsEnum(PieceType)
  pieceType?: PieceType;
}
