import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TransferStatus } from '@prisma/client';

export class UpdateTransferStatusDto {
  @ApiProperty({
    description: 'New status for the transfer',
    enum: [TransferStatus.IN_TRANZIT, TransferStatus.FINALIZAT, TransferStatus.ANULAT],
  })
  @IsEnum(TransferStatus)
  status: TransferStatus;

  @ApiPropertyOptional({
    description: 'Transport person (UUID). Required to move a transfer into IN_TRANZIT.',
  })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}
