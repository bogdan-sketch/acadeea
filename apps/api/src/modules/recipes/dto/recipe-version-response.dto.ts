import { ApiProperty } from '@nestjs/swagger';

export class RecipeVersionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() recipeId: string;
  @ApiProperty() version: number;
  @ApiProperty() snapshot: unknown;
  @ApiProperty() changedById: string;
  @ApiProperty() createdAt: Date;

  constructor(partial: Partial<RecipeVersionResponseDto>) {
    Object.assign(this, partial);
  }
}
