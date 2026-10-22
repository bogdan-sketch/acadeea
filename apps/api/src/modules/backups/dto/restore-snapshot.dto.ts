import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RestoreSnapshotDto {
  @ApiProperty({
    description: "Confirmare explicită — trebuie să fie exact 'RESTAUREAZA'",
    example: 'RESTAUREAZA',
  })
  @IsString()
  confirm: string;
}
