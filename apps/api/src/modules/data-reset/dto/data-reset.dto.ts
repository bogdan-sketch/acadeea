import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsString } from 'class-validator';

import { RESET_CATEGORY_KEYS, ResetCategoryKey } from '../data-reset.categories';

export class RunDataResetDto {
  @ApiProperty({
    description: 'Categoriile de date de șters (dependențele se includ automat)',
    enum: RESET_CATEGORY_KEYS,
    isArray: true,
    example: ['TASKS', 'STOCK'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(RESET_CATEGORY_KEYS, { each: true })
  categories: ResetCategoryKey[];

  @ApiProperty({
    description: "Confirmare explicită — trebuie să fie exact 'RESETEAZA'",
    example: 'RESETEAZA',
  })
  @IsString()
  confirm: string;
}

export class ResetCategoryPreviewDto {
  @ApiProperty({ enum: RESET_CATEGORY_KEYS })
  key: ResetCategoryKey;
  @ApiProperty()
  label: string;
  @ApiProperty()
  description: string;
  @ApiProperty({ enum: RESET_CATEGORY_KEYS, isArray: true })
  requires: ResetCategoryKey[];
  @ApiProperty({ description: 'Date de bază (rețete / materii prime) — avertisment suplimentar' })
  danger: boolean;
  @ApiProperty({ description: 'Rânduri per model care ar fi șterse', example: { Task: 120 } })
  counts: Record<string, number>;
  @ApiProperty()
  total: number;
}

export class DataResetPreviewDto {
  @ApiProperty({ type: [ResetCategoryPreviewDto] })
  categories: ResetCategoryPreviewDto[];
}

export class DataResetResultDto {
  @ApiProperty({
    enum: RESET_CATEGORY_KEYS,
    isArray: true,
    description: 'Categoriile efectiv rulate',
  })
  categories: ResetCategoryKey[];
  @ApiProperty({ nullable: true, description: 'Snapshot-ul de siguranță creat înainte de reset' })
  snapshotId: string | null;
  @ApiProperty({ description: 'Rânduri șterse per model', example: { Task: 120 } })
  deleted: Record<string, number>;
  @ApiProperty()
  total: number;
}
