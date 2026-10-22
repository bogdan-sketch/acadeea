import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class DraftRecipeDto {
  @ApiProperty({
    description: 'true → mark the recipe as a draft, false → publish it to the active list',
    example: true,
  })
  @IsBoolean()
  draft: boolean;
}
