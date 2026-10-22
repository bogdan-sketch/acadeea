import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

class RoleInfoDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
}

export class InvitationResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  email: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Assigned role', type: RoleInfoDto })
  role: RoleInfoDto | null;

  @Expose()
  @ApiProperty()
  createdById: string;

  @Expose()
  @ApiProperty()
  expiresAt: Date;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  acceptedAt: Date | null;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  constructor(partial: Partial<InvitationResponseDto>) {
    Object.assign(this, partial);
  }
}
