import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TransferApprovalStatus } from '@prisma/client';

export class UpdateTransferApprovalDto {
  @ApiProperty({ description: 'Approval status', enum: TransferApprovalStatus })
  @IsEnum(TransferApprovalStatus)
  status: TransferApprovalStatus;

  @ApiPropertyOptional({ description: 'Reason for approval/rejection' })
  @IsOptional()
  @IsString()
  reason?: string;
}
