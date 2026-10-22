import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ArchiveOrderDto {
  @ApiProperty({
    description: 'true → archive the order, false → restore it to the active list',
    example: true,
  })
  @IsBoolean()
  archived: boolean;
}
