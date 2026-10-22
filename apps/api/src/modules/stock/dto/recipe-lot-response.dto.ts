import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/** A production batch (lot) of a finished good / semipreparat, per location. */
export class RecipeLotResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty({
    description: 'Auto-generated: ddMMyyyy-<recipe name> N (N = same-day batch count)',
  })
  lotNumber: string;

  @Expose()
  @ApiProperty({ description: 'Quantity produced in this batch' })
  quantity: number;

  @Expose()
  @ApiProperty({ description: "What's left of this batch (FIFO)" })
  remainingQuantity: number;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  expiryDate: Date | null;

  @Expose()
  @ApiProperty()
  producedAt: Date;

  @Expose()
  @ApiProperty()
  locationId: string;

  @Expose()
  @ApiProperty()
  locationName: string;

  constructor(partial: Partial<RecipeLotResponseDto>) {
    Object.assign(this, partial);
  }
}
