import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    example: 'P@ssw0rd!',
    description: 'Current account password, required to confirm deletion',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;
}
