import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SupplierMaterialDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() unit: string;
  @ApiProperty() stockCount: number;
  @ApiProperty() minimumStock: number;
  @ApiProperty() status: string;
  @ApiProperty({ description: 'stockCount <= minimumStock' }) isLow: boolean;

  constructor(p: Partial<SupplierMaterialDto>) {
    Object.assign(this, p);
  }
}

export class SupplierResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) contactPerson: string | null;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
  @ApiPropertyOptional({ nullable: true }) email: string | null;
  @ApiPropertyOptional({ nullable: true }) notes: string | null;
  @ApiProperty() materialCount: number;
  @ApiProperty({ description: 'Materials at or below their minimum stock' }) lowStockCount: number;
  @ApiProperty({ type: [SupplierMaterialDto] }) materials: SupplierMaterialDto[];
  @ApiProperty() createdAt: Date;

  constructor(p: Partial<SupplierResponseDto>) {
    Object.assign(this, p);
  }
}
