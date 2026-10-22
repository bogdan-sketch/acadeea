import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '@prisma/client';

/**
 * Actual byproduct quantity left over by a finalized production (trimmings
 * vary batch to batch, so the operator reports them — they are NOT derived
 * from the recipe's declared yield when this list is sent).
 */
export class TransitionByproductDto {
  @ApiProperty({
    description:
      'Byproduct recipe id — must be an active byproduct (isByproduct) of the ' +
      "produced recipe (or of one of the task's subtask recipes).",
    format: 'uuid',
  })
  @IsUUID()
  recipeId: string;

  @ApiProperty({
    description: "Quantity actually left over, in the byproduct recipe's own unit. 0 = none.",
    example: 1.5,
  })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  quantity: number;
}

export class TransitionTaskDto {
  @ApiProperty({
    description: 'Target status for the transition',
    enum: TaskStatus,
    example: 'IN_LUCRU',
  })
  @IsEnum(TaskStatus)
  status: TaskStatus;

  @ApiPropertyOptional({
    description: 'Reason for the transition (required for cancellation)',
    example: 'Client a anulat comanda',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Actual yield produced (required when status is FINALIZAT)',
    example: 4.5,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  actualYield?: number;

  @ApiPropertyOptional({
    description:
      'Destination location for the finished goods (FINALIZAT). Defaults to the ' +
      'production location; if different, a transfer (foaie de drum) is generated.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  outputLocationId?: string;

  @ApiPropertyOptional({
    description:
      'Actual byproduct quantities left over (FINALIZAT only). When SENT, it is ' +
      'authoritative: exactly the listed quantities are credited to stock at the ' +
      'production location (byproducts not listed get nothing). When OMITTED, the legacy ' +
      'fallback credits each declared byproduct with yieldQuantity × scaleFactor.',
    type: [TransitionByproductDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransitionByproductDto)
  byproducts?: TransitionByproductDto[];
}
