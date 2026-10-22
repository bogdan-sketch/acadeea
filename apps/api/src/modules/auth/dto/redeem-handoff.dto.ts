import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RedeemHandoffDto {
  @ApiProperty({ description: 'Single-use handoff code minted at login on the apex domain' })
  @IsString()
  @Length(16, 128)
  code: string;
}
