import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { TransferStatus, UnitType } from '@prisma/client';

export class TransferItemResponseDto {
  @Expose()
  @ApiProperty({ description: 'Item ID' })
  id: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Raw material ID (null for recipe items)', nullable: true })
  rawMaterialId: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Recipe ID (null for raw-material items)', nullable: true })
  recipeId: string | null;

  @Expose()
  @ApiProperty({ description: 'Item title (raw material or recipe name)' })
  rawMaterialTitle: string;

  @Expose()
  @ApiProperty({ description: 'Quantity' })
  quantity: number;

  @Expose()
  @ApiProperty({ description: 'Unit', enum: UnitType })
  unit: UnitType;

  constructor(partial: Partial<TransferItemResponseDto>) {
    Object.assign(this, partial);
  }
}

export class TransferLocationDto {
  @Expose()
  @ApiProperty({ description: 'Location ID' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Location name' })
  name: string;

  @Expose()
  @ApiProperty({ description: 'Location address' })
  address: string;

  constructor(partial: Partial<TransferLocationDto>) {
    Object.assign(this, partial);
  }
}

export class TransferUserDto {
  @Expose()
  @ApiProperty({ description: 'User ID' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'First name' })
  firstName: string;

  @Expose()
  @ApiProperty({ description: 'Last name' })
  lastName: string;

  constructor(partial: Partial<TransferUserDto>) {
    Object.assign(this, partial);
  }
}

export class TransferApprovalDto {
  @Expose()
  @ApiProperty({ description: 'Approval status', enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  status: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Approval/rejection reason', nullable: true })
  reason: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Approver user ID', nullable: true })
  approvedById: string | null;

  constructor(partial: Partial<TransferApprovalDto>) {
    Object.assign(this, partial);
  }
}

export class TransferResponseDto {
  @Expose()
  @ApiProperty({ description: 'Transfer ID' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Transfer status', enum: TransferStatus })
  status: TransferStatus;

  @Expose()
  @ApiPropertyOptional({ description: 'Notes', nullable: true })
  notes: string | null;

  @Expose()
  @ApiProperty({ description: 'Source location' })
  @Type(() => TransferLocationDto)
  fromLocation: TransferLocationDto;

  @Expose()
  @ApiProperty({
    description:
      'Destination location. For ad-hoc destinations (adhocDestination=true) this is synthesized ' +
      'from the free-text name/address with an empty id.',
  })
  @Type(() => TransferLocationDto)
  toLocation: TransferLocationDto;

  @Expose()
  @ApiProperty({
    description:
      'True when the destination is a one-off (event) address, not a saved location — goods leave the system on completion.',
  })
  adhocDestination: boolean;

  @Expose()
  @ApiPropertyOptional({
    description: 'Recipient (person) at the destination — printed on the aviz.',
    nullable: true,
  })
  destinationContact: string | null;

  @Expose()
  @ApiProperty({ description: 'Created by user' })
  @Type(() => TransferUserDto)
  createdBy: TransferUserDto;

  @Expose()
  @ApiPropertyOptional({ description: 'Transport person', nullable: true })
  @Type(() => TransferUserDto)
  assignedTo: TransferUserDto | null;

  @Expose()
  @ApiProperty({ description: 'Transfer items', type: [TransferItemResponseDto] })
  @Type(() => TransferItemResponseDto)
  items: TransferItemResponseDto[];

  @Expose()
  @ApiPropertyOptional({ description: 'Approval decision (null until reviewed)', nullable: true })
  @Type(() => TransferApprovalDto)
  approval: TransferApprovalDto | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Delegate ID card (serie + numar)', nullable: true })
  delegateIdCard: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Means of transport', nullable: true })
  transportMeans: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Dispatch time (ora expeditiei)', nullable: true })
  dispatchedAt: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Name of the person who received the goods', nullable: true })
  receiverName: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Receipt signature timestamp', nullable: true })
  receivedAt: Date | null;

  @Expose()
  @ApiProperty({ description: 'Whether a receipt signature image is stored' })
  hasReceiverSignature: boolean;

  @Expose()
  @ApiPropertyOptional({ description: 'Completion timestamp', nullable: true })
  completedAt: Date | null;

  @Expose()
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  constructor(partial: Partial<TransferResponseDto>) {
    Object.assign(this, partial);
  }
}
