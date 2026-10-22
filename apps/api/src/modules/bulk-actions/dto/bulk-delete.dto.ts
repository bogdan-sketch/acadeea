import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class BulkDeletePreviewRequestDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Rows to inspect (max 500)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class BulkDeleteRequestDto extends BulkDeletePreviewRequestDto {
  @ApiPropertyOptional({
    description:
      'true = also remove/unlink every dependent reported by the preview (the user confirmed). ' +
      'false/omitted = a row with dependents is left untouched and reported in `failed`.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  cascade?: boolean;
}

export class BulkDependentDto {
  @ApiProperty() key!: string;
  @ApiProperty({ description: 'Romanian, user-facing' }) label!: string;
  @ApiProperty() count!: number;
}

export class BulkDeletePreviewDto {
  @ApiProperty({ description: 'How many of the requested ids exist in the caller’s organization' })
  found!: number;
  @ApiProperty({
    type: [String],
    description: 'Requested ids that do not exist (or belong elsewhere)',
  })
  missing!: string[];
  @ApiProperty({
    type: [BulkDependentDto],
    description:
      'Everything else the delete would touch, summed over all ids. Empty = clean delete.',
  })
  dependents!: BulkDependentDto[];
}

export class BulkDeleteFailureDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Romanian, user-facing' }) reason!: string;
}

export class BulkDeleteResultDto {
  @ApiProperty({ type: [String] }) deleted!: string[];
  @ApiProperty({ type: [BulkDeleteFailureDto] }) failed!: BulkDeleteFailureDto[];
}
