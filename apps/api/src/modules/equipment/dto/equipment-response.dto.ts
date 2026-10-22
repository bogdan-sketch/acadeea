import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { EquipmentType, EquipmentStatus } from '@prisma/client';

export class EquipmentResponseDto {
  @Expose()
  @ApiProperty({ description: 'Unique identifier (UUID)' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Equipment name' })
  name: string;

  @Expose()
  @ApiProperty({ description: 'Equipment type', enum: EquipmentType })
  type: EquipmentType;

  @Expose()
  @ApiProperty({ description: 'Quantity available' })
  quantity: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Location ID', nullable: true })
  locationId: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Location name', nullable: true })
  locationName: string | null;

  @Expose()
  @ApiProperty({ description: 'Equipment status', enum: EquipmentStatus })
  status: EquipmentStatus;

  @Expose()
  @ApiPropertyOptional({ description: 'Purchase date', nullable: true })
  purchaseDate: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Warranty expiry date', nullable: true })
  warrantyExpiry: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Additional notes', nullable: true })
  notes: string | null;

  @Expose()
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  constructor(partial: Partial<EquipmentResponseDto>) {
    Object.assign(this, partial);
  }
}

export class MaintenanceLogResponseDto {
  @Expose()
  @ApiProperty({ description: 'Unique identifier (UUID)' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Equipment ID' })
  equipmentId: string;

  @Expose()
  @ApiProperty({ description: 'Maintenance description' })
  description: string;

  @Expose()
  @ApiProperty({ description: 'User who performed the maintenance' })
  performedById: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Next scheduled maintenance date', nullable: true })
  nextScheduled: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Maintenance cost', nullable: true })
  cost: number | null;

  @Expose()
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  constructor(partial: Partial<MaintenanceLogResponseDto>) {
    Object.assign(this, partial);
  }
}

export class EquipmentReservationResponseDto {
  @Expose()
  @ApiProperty({ description: 'Unique identifier (UUID)' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Equipment ID' })
  equipmentId: string;

  @Expose()
  @ApiProperty({ description: 'Task ID' })
  taskId: string;

  @Expose()
  @ApiProperty({ description: 'Quantity reserved' })
  quantity: number;

  @Expose()
  @ApiProperty({ description: 'Reservation start date' })
  reservedFrom: Date;

  @Expose()
  @ApiProperty({ description: 'Reservation end date' })
  reservedUntil: Date;

  @Expose()
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  constructor(partial: Partial<EquipmentReservationResponseDto>) {
    Object.assign(this, partial);
  }
}
