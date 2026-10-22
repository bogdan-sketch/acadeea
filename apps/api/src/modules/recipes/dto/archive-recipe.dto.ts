import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ArchiveRecipeDto {
  @ApiProperty({
    description: 'true → archive the recipe, false → restore it to the active list',
    example: true,
  })
  @IsBoolean()
  archived: boolean;
}
