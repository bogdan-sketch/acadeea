import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DeliveryMethodSummaryDto {
  @ApiProperty({
    description: 'Method exactly as imported from the shop',
    example: 'Livrare în Cluj-Napoca',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Admin-set short name (null = none)',
    nullable: true,
    example: 'Cluj',
  })
  shortName: string | null;

  @ApiProperty({
    description: 'What clients show: shortName, else the name without a leading "Ridicare la …"',
    example: 'Acadeea Napoca',
  })
  label: string;

  @ApiProperty({
    description: 'Ridicare (PICKUP) or Livrare (DELIVERY) — admin assignment, else auto-detected',
    enum: ['PICKUP', 'DELIVERY'],
  })
  kind: 'PICKUP' | 'DELIVERY';

  @ApiProperty({ description: 'true when kind was set by an admin (not auto-detected)' })
  kindSet: boolean;

  @ApiProperty({ description: 'Active (non-archived) orders with this method' })
  count: number;

  constructor(partial: DeliveryMethodSummaryDto) {
    Object.assign(this, partial);
  }
}

export class SetDeliveryMethodAliasDto {
  @ApiProperty({ description: 'Method exactly as imported', example: 'Livrare în Cluj-Napoca' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    description:
      'Short name for filters and order cards; empty/null removes it. Omitted = unchanged.',
    nullable: true,
    example: 'Cluj',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortName?: string | null;

  @ApiPropertyOptional({
    description:
      'Ridicare / Livrare assignment; null = back to auto-detection. Omitted = unchanged.',
    enum: ['PICKUP', 'DELIVERY'],
    nullable: true,
  })
  @IsOptional()
  @IsIn(['PICKUP', 'DELIVERY', null])
  kind?: 'PICKUP' | 'DELIVERY' | null;
}
