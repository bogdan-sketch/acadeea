import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CreateProductMappingDto {
  @ApiProperty({
    description: 'Product ID in the external system',
    example: 'ext-prod-001',
  })
  @IsString()
  externalProductId: string;

  @ApiProperty({
    description: 'Product name in the external system',
    example: 'Croissant cu ciocolata',
  })
  @IsString()
  externalProductName: string;

  @ApiProperty({
    description: 'Horae recipe ID to map to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  recipeId: string;
}
