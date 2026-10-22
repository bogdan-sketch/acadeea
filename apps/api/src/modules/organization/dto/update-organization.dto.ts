import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Predefined UI fonts (duplicated from organization.service to avoid a cycle). */
const FONT_FAMILY_KEYS = ['inter', 'manrope', 'lora', 'poppins', 'system'];

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Hex color, e.g. #D4527B' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'accentColor must be a valid hex color (e.g. #D4527B)' })
  accentColor?: string;

  @ApiPropertyOptional({
    description: 'Secondary brand color (hex); null resets to client default',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'secondaryColor must be a valid hex color (e.g. #2E9E4F)',
  })
  secondaryColor?: string | null;

  @ApiPropertyOptional({
    description: 'Tertiary brand color (hex); null resets to client default',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'tertiaryColor must be a valid hex color (e.g. #E07C00)',
  })
  tertiaryColor?: string | null;

  @ApiPropertyOptional({
    description:
      'Extended per-platform theme overrides: { web|ios|android: { token: value } }. ' +
      'Token keys are whitelisted server-side; null clears all overrides.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  brandingTokens?: Record<string, Record<string, string | Record<string, string>>> | null;

  @ApiPropertyOptional({
    description: `Predefined UI font key (${FONT_FAMILY_KEYS.join(' | ')}); null resets to default`,
    nullable: true,
  })
  @IsOptional()
  @IsIn([...FONT_FAMILY_KEYS, null])
  fontFamily?: string | null;

  @ApiPropertyOptional({ description: 'Default delivery location ID (UUID, null to clear)' })
  @IsOptional()
  @IsUUID()
  defaultDeliveryLocationId?: string | null;

  @ApiPropertyOptional({
    description:
      'Default production/reception location ID (UUID, null to clear) — used by task creation and goods receipt when no user-specific default applies',
  })
  @IsOptional()
  @IsUUID()
  defaultLocationId?: string | null;

  @ApiPropertyOptional({ description: 'iOS alternate app icon name (null = default)' })
  @IsOptional()
  @IsString()
  appIconName?: string | null;

  @ApiPropertyOptional({
    description: 'Feature switch: nutrition values per ingredient + recipe nutrition',
  })
  @IsOptional()
  @IsBoolean()
  nutritionEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Feature switch: WooCommerce delivery date/method import, location external id + main unit, delivery-method filters',
  })
  @IsOptional()
  @IsBoolean()
  wooDeliveryEnabled?: boolean;

  @ApiPropertyOptional({ description: 'VAT payer (plătitor de TVA)' })
  @IsOptional()
  @IsBoolean()
  vatPayer?: boolean;

  @ApiPropertyOptional({ description: 'VAT rate percent (e.g. 21, 11)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRatePercent?: number;

  @ApiPropertyOptional({ description: 'CUI (legal tax id) for printed documents' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cui?: string;

  @ApiPropertyOptional({ description: 'Legal/registered address for printed documents' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalAddress?: string;

  @ApiPropertyOptional({ description: 'Trade registry number (e.g. J2019004159128)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  regCom?: string;

  @ApiPropertyOptional({ description: 'Contact phone for printed documents' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Contact email for printed documents' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Website for printed documents' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  website?: string;

  @ApiPropertyOptional({ description: 'Administrator name (signs the conformity declaration)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  administratorName?: string;
}
