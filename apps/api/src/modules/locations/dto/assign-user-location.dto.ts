import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class AssignUserLocationDto {
  @ApiProperty({ description: 'User ID to assign' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ description: 'Whether this is the primary location for the user' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
