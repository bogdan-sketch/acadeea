import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { UserRole } from '@prisma/client';

export class LocationUserResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  userId: string;

  @Expose()
  @ApiProperty()
  firstName: string;

  @Expose()
  @ApiProperty()
  lastName: string;

  @Expose()
  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @Expose()
  @ApiProperty()
  isPrimary: boolean;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  constructor(partial: Partial<LocationUserResponseDto>) {
    Object.assign(this, partial);
  }
}
