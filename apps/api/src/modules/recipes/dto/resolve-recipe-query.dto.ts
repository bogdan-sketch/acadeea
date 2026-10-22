import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType } from '@prisma/client';

export class ResolveRecipeQueryDto {
  @ApiProperty({
    description: 'Target quantity to scale the recipe to',
    example: 10,
  })
  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({
    description: 'Target unit for the scaled recipe',
    enum: UnitType,
    example: 'KILOGRAME',
  })
  @IsEnum(UnitType)
  unit: UnitType;
}
