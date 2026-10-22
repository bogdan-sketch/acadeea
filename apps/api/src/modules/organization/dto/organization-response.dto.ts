import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrganizationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 'acadeea', description: 'Subdomain slug — <slug>.horae.ca' })
  slug: string;

  @ApiProperty()
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

  @ApiProperty({ nullable: true })
  defaultDeliveryLocationId: string | null;

  @ApiProperty({ nullable: true })
  defaultLocationId: string | null;

  @ApiProperty({ nullable: true })
  appIconName: string | null;

  @ApiProperty({ description: 'Feature switch: nutrition values (default off)' })
  nutritionEnabled: boolean;

  @ApiProperty({
    description:
      'Feature switch: WooCommerce delivery date/method import, location external id + main unit, delivery-method filters (default off)',
  })
  wooDeliveryEnabled: boolean;

  @ApiProperty({
    description:
      'VAT payer (plătitor de TVA). Stored purchase prices are the org cost basis: net for payers, gross for non-payers.',
  })
  vatPayer: boolean;

  @ApiProperty({ description: 'VAT rate percent used to convert entered prices (default 21)' })
  vatRatePercent: number;

  @ApiPropertyOptional({ description: 'CUI (legal tax id)', nullable: true })
  cui: string | null;

  @ApiPropertyOptional({ description: 'Legal/registered address', nullable: true })
  legalAddress: string | null;

  @ApiPropertyOptional({ description: 'Trade registry number', nullable: true })
  regCom: string | null;

  @ApiPropertyOptional({ description: 'Contact phone', nullable: true })
  contactPhone: string | null;

  @ApiPropertyOptional({ description: 'Contact email', nullable: true })
  contactEmail: string | null;

  @ApiPropertyOptional({ description: 'Website', nullable: true })
  website: string | null;

  @ApiPropertyOptional({ description: 'Administrator name', nullable: true })
  administratorName: string | null;
}
