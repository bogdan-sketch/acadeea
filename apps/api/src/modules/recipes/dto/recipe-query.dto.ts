import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RecipeType } from '@prisma/client';
import { QueryBoolean } from '@/common/transforms/query-boolean';

export class RecipeQueryDto {
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
    description: 'Search term — filters by recipe name (case-insensitive)',
    example: 'tort',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by recipe type',
    enum: RecipeType,
    example: 'FINAL',
  })
  @IsOptional()
  @IsEnum(RecipeType)
  type?: RecipeType;

  @ApiPropertyOptional({
    description: 'Filter by recipe category',
    example: 'Torturi',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter by creator user ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('all')
  createdById?: string;

  @ApiPropertyOptional({
    description:
      'Archive filter: omitted/false → only active recipes (the default everywhere), ' +
      'true → only archived recipes.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  // Map only the two valid string literals; anything else stays as-is so
  // @IsBoolean can 400 it (a bare `=== 'true'` would silently coerce
  // `?archived=yes` to false).
  @QueryBoolean()
  archived?: boolean;

  @ApiPropertyOptional({
    description:
      'Byproduct filter: omitted → all recipes (byproducts included), ' +
      'true → only byproducts, false → only non-byproducts.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  // Same defensive mapping as `archived` — only the two valid string literals
  // are coerced so @IsBoolean can 400 anything else.
  @QueryBoolean()
  byproduct?: boolean;

  @ApiPropertyOptional({
    description:
      'Draft filter: omitted/false → only published recipes (the default everywhere), ' +
      'true → only draft recipes.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  // Same defensive mapping as `archived` — only the two valid string literals
  // are coerced so @IsBoolean can 400 anything else.
  @QueryBoolean()
  draft?: boolean;
}
