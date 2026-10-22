import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ProductMappingResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  integrationId: string;

  @Expose()
  @ApiProperty()
  externalProductId: string;

  @Expose()
  @ApiProperty()
  externalProductName: string;

  @Expose()
  @ApiProperty()
  recipeId: string;

  @Expose()
  @ApiProperty()
  recipeName: string;

  @Expose()
  @ApiProperty()
  createdAt: string;

  constructor(partial: Partial<ProductMappingResponseDto>) {
    Object.assign(this, partial);
  }
}
