import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { BulkDeleteFailureDto } from './bulk-delete.dto';

export class BulkActionRequestDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Rows to act on (max 500)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids!: string[];

  @ApiProperty({
    description:
      'Action key, per resource (see BULK_ACTIONS): tasks status|assign|plannedDate|dueDate|priority|location; ' +
      'orders status|assign|dueDate|archive; transfers status; raw-materials category|status|supplier|minimumStock; ' +
      'consumables category|status|minimumStock; recipes archive|draft|category; sales-deductions discard|revert',
  })
  @IsString()
  @MaxLength(40)
  action!: string;

  @ApiPropertyOptional({ description: 'Action parameters (validated per action)', type: Object })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

export class BulkActionResultDto {
  @ApiProperty({ type: [String] }) done!: string[];
  @ApiProperty({ type: [BulkDeleteFailureDto] }) failed!: BulkDeleteFailureDto[];
}
