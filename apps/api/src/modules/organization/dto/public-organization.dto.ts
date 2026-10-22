import { ApiProperty } from '@nestjs/swagger';

/**
 * Public branding subset of an organization, looked up by subdomain slug for
 * the org-themed login/landing pages. Never includes legal identity fields.
 */
export class PublicOrganizationDto {
  @ApiProperty({ example: 'Acadeea' })
  name: string;

  @ApiProperty({ example: 'acadeea' })
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
}
