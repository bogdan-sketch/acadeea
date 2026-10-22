import { ApiProperty } from '@nestjs/swagger';

class RoleInfoDto {
  @ApiProperty({ example: 'administrator' })
  slug: string;

  @ApiProperty({ example: 'Administrator' })
  name: string;
}

class PermissionDto {
  @ApiProperty({ example: 'read' })
  action: string;

  @ApiProperty({ example: 'Recipe' })
  subject: string;
}

class AuthUserDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'user@acadeea.ro' })
  email: string;

  @ApiProperty({ example: 'Ion' })
  firstName: string;

  @ApiProperty({ example: 'Popescu' })
  lastName: string;

  @ApiProperty({ description: 'User role info', type: RoleInfoDto })
  role: RoleInfoDto;

  @ApiProperty({ description: 'Granted permissions', type: [PermissionDto] })
  permissions: PermissionDto[];
}

export class OrgBrandingDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Acadeea' })
  name: string;

  @ApiProperty({ example: 'acadeea', description: 'Subdomain slug — <slug>.horae.ca' })
  slug: string;

  @ApiProperty({ example: '#D4527B' })
  accentColor: string;

  @ApiProperty({ nullable: true, description: 'Secondary brand color (null = client default)' })
  secondaryColor: string | null;

  @ApiProperty({ nullable: true, description: 'Tertiary brand color (null = client default)' })
  tertiaryColor: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Extended per-platform theme overrides ({ web|ios|android: { token: value } })',
  })
  brandingTokens: Record<string, Record<string, string | Record<string, string>>> | null;

  @ApiProperty({ nullable: true, description: 'Predefined UI font key (null = default)' })
  fontFamily: string | null;

  @ApiProperty({ nullable: true })
  logoUrl: string | null;

  @ApiProperty({ nullable: true })
  logoLightUrl: string | null;

  @ApiProperty({ nullable: true })
  logoDarkUrl: string | null;

  @ApiProperty({ nullable: true })
  appLogoLightUrl: string | null;

  @ApiProperty({ nullable: true })
  appLogoDarkUrl: string | null;

  @ApiProperty({ nullable: true, description: 'Selected iOS alternate app icon' })
  appIconName: string | null;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT access token (RS256)' })
  accessToken: string;

  @ApiProperty({ description: 'Opaque refresh token for token rotation' })
  refreshToken: string;

  @ApiProperty({
    description:
      'Single-use, 60s code for handing the session from the apex domain to the org subdomain (present on login only)',
    required: false,
  })
  handoffCode?: string;

  @ApiProperty({
    description: 'Branding of the organization the user belongs to',
    type: OrgBrandingDto,
  })
  organization: OrgBrandingDto;

  @ApiProperty({ description: 'Authenticated user profile', type: AuthUserDto })
  user: AuthUserDto;
}

export class TokenResponseDto {
  @ApiProperty({ description: 'New JWT access token (RS256)' })
  accessToken: string;

  @ApiProperty({ description: 'New refresh token (rotated)' })
  refreshToken: string;
}
