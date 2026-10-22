import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSnapshotDto {
  @ApiPropertyOptional({
    description: 'Etichetă opțională pentru snapshot (ex: "Înainte de inventar")',
    example: 'Înainte de inventar',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}
