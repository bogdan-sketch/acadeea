import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class LocationDashboardMaterialDto {
  @Expose()
  @ApiProperty()
  rawMaterialId: string;

  @Expose()
  @ApiProperty()
  title: string;

  @Expose()
  @ApiProperty()
  quantity: number;

  @Expose()
  @ApiProperty()
  unit: string;

  constructor(partial: Partial<LocationDashboardMaterialDto>) {
    Object.assign(this, partial);
  }
}

export class LocationDashboardResponseDto {
  @Expose()
  @ApiProperty()
  locationId: string;

  @Expose()
  @ApiProperty()
  locationName: string;

  @Expose()
  @ApiProperty()
  totalMaterials: number;

  @Expose()
  @ApiProperty()
  assignedUsers: number;

  @Expose()
  @ApiProperty()
  pendingInboundTransfers: number;

  @Expose()
  @ApiProperty()
  pendingOutboundTransfers: number;

  @Expose()
  @ApiProperty({ type: [LocationDashboardMaterialDto] })
  lowStockMaterials: LocationDashboardMaterialDto[];

  constructor(partial: Partial<LocationDashboardResponseDto>) {
    Object.assign(this, partial);
  }
}
