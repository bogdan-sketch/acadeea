import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SystemLogLevel } from '@prisma/client';
import { QueryBoolean } from '@/common/transforms/query-boolean';

export class SystemLogQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'HTTP | AUTH | EMAIL | JOB | INTEGRATION | SYSTEM' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  category?: string;

  @ApiPropertyOptional({ enum: SystemLogLevel, description: 'Minimum level' })
  @IsOptional()
  @IsEnum(SystemLogLevel)
  level?: SystemLogLevel;

  @ApiPropertyOptional({ description: 'Free text: message, action, path, user email' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'ISO date/time (inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date/time (inclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Platform admins only: every organization + system-wide events',
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  allOrgs?: boolean;
}

export class SystemLogResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ enum: SystemLogLevel }) level: SystemLogLevel;
  @ApiProperty() category: string;
  @ApiProperty() action: string;
  @ApiProperty() message: string;
  @ApiPropertyOptional({ nullable: true }) organizationId: string | null;
  @ApiPropertyOptional({ nullable: true }) organizationName: string | null;
  @ApiPropertyOptional({ nullable: true }) userId: string | null;
  @ApiPropertyOptional({ nullable: true }) userEmail: string | null;
  @ApiPropertyOptional({ nullable: true }) method: string | null;
  @ApiPropertyOptional({ nullable: true }) path: string | null;
  @ApiPropertyOptional({ nullable: true }) statusCode: number | null;
  @ApiPropertyOptional({ nullable: true }) durationMs: number | null;
  @ApiPropertyOptional({ nullable: true }) correlationId: string | null;
  @ApiPropertyOptional({ nullable: true }) ip: string | null;
  @ApiPropertyOptional({ nullable: true }) metadata: unknown;

  constructor(p: SystemLogResponseDto) {
    Object.assign(this, p);
  }
}
