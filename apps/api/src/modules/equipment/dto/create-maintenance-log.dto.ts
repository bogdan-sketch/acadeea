import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateMaintenanceLogDto {
  @ApiProperty({ description: 'Maintenance description', example: 'Replaced heating element' })
  @IsString()
  @MinLength(2)
  description: string;

  @ApiPropertyOptional({
    description: 'Next scheduled maintenance date (ISO 8601)',
    example: '2025-06-01',
  })
  @IsOptional()
  @IsISO8601()
  nextScheduled?: string;

  @ApiPropertyOptional({ description: 'Maintenance cost', example: 150.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;
}
