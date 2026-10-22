import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SignDeliveryNoteDto {
  @ApiProperty({ description: 'Name of the person signing' })
  @IsString()
  @MinLength(1)
  signedByName: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
