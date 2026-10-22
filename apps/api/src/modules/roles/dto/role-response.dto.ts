import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PermissionDto {
  @ApiProperty() action: string;
  @ApiProperty() subject: string;
}

export class RoleResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty() isSystem: boolean;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty({ type: [PermissionDto] }) permissions: PermissionDto[];
  @ApiProperty() userCount: number;
  @ApiProperty() createdAt: Date;

  constructor(partial: Partial<RoleResponseDto>) {
    Object.assign(this, partial);
  }
}
