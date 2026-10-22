import { IsEnum, IsInt, IsString, IsUUID, Min } from 'class-validator';

export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export class StockUpdateDto {
  @IsUUID()
  materialId: string;

  @IsString()
  materialTitle: string;

  @IsInt()
  @Min(0)
  newStockCount: number;

  @IsEnum(MovementType)
  movementType: MovementType;
}
