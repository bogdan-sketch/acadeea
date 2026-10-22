import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

class RoleInfoDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
}

@Exclude()
export class UserResponseDto {
  @Expose()
  @ApiProperty({
    description: 'User unique identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @Expose()
  @ApiProperty({
    description: 'User email address',
    example: 'user@acadeea.ro',
  })
  email: string;

  @Expose()
  @ApiProperty({
    description: 'User first name',
    example: 'Ion',
  })
  firstName: string;

  @Expose()
  @ApiProperty({
    description: 'User last name',
    example: 'Popescu',
  })
  lastName: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'User role',
    type: RoleInfoDto,
  })
  role: RoleInfoDto | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Profile photo path (/api/v1/images/<id>, WebP) — null = initials',
    nullable: true,
  })
  avatarUrl?: string | null;

  @Expose()
  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
  })
  isActive: boolean;

  @Expose()
  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
