import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { getCurrentTenantId } from '@/prisma/tenant-context';
import { OrganizationResponseDto, PublicOrganizationDto, UpdateOrganizationDto } from './dto';

/**
 * Predefined UI fonts a tenant admin can pick from (Organization.fontFamily).
 * Keys are mapped by each client to its own bundled/local font. null = default.
 */
export const FONT_FAMILIES = ['inter', 'manrope', 'lora', 'poppins', 'system'] as const;

/** Logo variant → Organization column. */
export const LOGO_VARIANTS = {
  default: 'logoUrl',
  'login-light': 'logoLightUrl',
  'login-dark': 'logoDarkUrl',
  'app-light': 'appLogoLightUrl',
  'app-dark': 'appLogoDarkUrl',
} as const;
export type LogoVariant = keyof typeof LOGO_VARIANTS;

/**
 * Logos are stored as base64 data URIs (multi-MB JPEGs) — embedding them in
 * JSON made login/by-slug responses ~20 MB. Every read path rewrites them to
 * the cacheable binary endpoint instead; clients prepend their API base URL.
 */
export function toLogoPath(
  slug: string,
  variant: LogoVariant,
  value: string | null,
): string | null {
  if (!value) return null;
  if (!value.startsWith('data:')) return value; // already a URL
  return `/api/v1/organization/by-slug/${encodeURIComponent(slug)}/logo/${variant}`;
}

export function mapLogoFields<
  T extends {
    slug: string;
    logoUrl: string | null;
    logoLightUrl: string | null;
    logoDarkUrl: string | null;
    appLogoLightUrl: string | null;
    appLogoDarkUrl: string | null;
    brandingTokens?: unknown;
  },
>(
  org: T,
): Omit<T, 'brandingTokens'> & {
  vatRatePercent: number;
  brandingTokens: Record<string, Record<string, string | Record<string, string>>> | null;
} {
  return {
    ...org,
    logoUrl: toLogoPath(org.slug, 'default', org.logoUrl),
    logoLightUrl: toLogoPath(org.slug, 'login-light', org.logoLightUrl),
    logoDarkUrl: toLogoPath(org.slug, 'login-dark', org.logoDarkUrl),
    appLogoLightUrl: toLogoPath(org.slug, 'app-light', org.appLogoLightUrl),
    appLogoDarkUrl: toLogoPath(org.slug, 'app-dark', org.appLogoDarkUrl),
    // Prisma stores brandingTokens as JsonValue — narrow it to the DTO shape.
    brandingTokens:
      (org.brandingTokens as
        | Record<string, Record<string, string | Record<string, string>>>
        | null
        | undefined) ?? null,
    // Prisma Decimal → plain number for JSON clients (only when present —
    // some callers pass partial/branding-only objects).
    ...('vatRatePercent' in org
      ? { vatRatePercent: Number((org as { vatRatePercent: unknown }).vatRatePercent) }
      : {}),
  } as Omit<T, 'brandingTokens'> & {
    vatRatePercent: number;
    brandingTokens: Record<string, Record<string, string | Record<string, string>>> | null;
  };
}

/** Whitelists for the extended per-platform branding tokens. */
const BRANDING_PLATFORMS = ['web', 'ios', 'android'] as const;
/** Per-scheme color tokens — every color a client derives its UI from. */
const BRANDING_COLOR_KEYS = [
  'accent',
  'accentPressed',
  'textPrimary',
  'textSecondary',
  'background',
  'card',
  'separator',
  'secondary',
  'tertiary',
] as const;
/** Scheme-independent tokens (shape, not color). */
const BRANDING_RADIUS_KEYS = ['radiusCard', 'radiusSheet'] as const;
const BRANDING_SCHEMES = ['light', 'dark'] as const;

/** Value formats per token key — these land as CSS/native style literals on
 * PUBLIC pages (the by-slug login theming), so anything that isn't a plain
 * hex color or a px/rem radius is dropped (closes e.g. `url(...)` beacons).
 * Colors allow #RGB/#RRGGBB/#RRGGBBAA (alpha for separators). */
const BRANDING_HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const BRANDING_RADIUS_RE = /^\d*\.?\d+(px|rem)$/;

function sanitizeColorSet(raw: unknown): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const key of BRANDING_COLOR_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== 'string') continue;
    const v = value.trim();
    if (v.length === 0 || v.length > 32) continue;
    if (BRANDING_HEX_RE.test(v)) clean[key] = v;
  }
  return clean;
}

/**
 * Keep only known platforms/schemes/token keys with plausible values.
 * Canonical stored shape (per platform):
 *   { light?: {accent, textPrimary, ...}, dark?: {...}, radiusCard?, radiusSheet? }
 * LEGACY inputs with flat color keys on the platform object are upgraded by
 * copying each flat color into BOTH schemes (scheme-specific values win).
 * A NON-null input that sanitizes down to nothing is rejected (400) instead
 * of silently wiping the stored overrides; explicit null still clears.
 */
function sanitizeBrandingTokens(
  input: Record<string, Record<string, unknown>> | null,
): Record<string, Record<string, string | Record<string, string>>> | null {
  if (input == null) return null;
  const out: Record<string, Record<string, string | Record<string, string>>> = {};
  for (const platform of BRANDING_PLATFORMS) {
    const tokens = input[platform];
    if (!tokens || typeof tokens !== 'object') continue;
    const clean: Record<string, string | Record<string, string>> = {};

    // Legacy flat colors apply to both schemes unless the scheme overrides.
    const flat = sanitizeColorSet(tokens);
    for (const scheme of BRANDING_SCHEMES) {
      const set = { ...flat, ...sanitizeColorSet(tokens[scheme]) };
      if (Object.keys(set).length > 0) clean[scheme] = set;
    }

    for (const key of BRANDING_RADIUS_KEYS) {
      const raw = tokens[key];
      if (typeof raw !== 'string') continue;
      const v = raw.trim();
      if (v.length > 0 && v.length <= 32 && BRANDING_RADIUS_RE.test(v)) clean[key] = v;
    }
    if (Object.keys(clean).length > 0) out[platform] = clean;
  }
  if (Object.keys(out).length === 0) {
    throw new BadRequestException('brandingTokens nu conține nicio valoare validă');
  }
  return out;
}

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  /** The authenticated user's organization (from the tenant context). */
  private async current() {
    const organizationId = getCurrentTenantId();
    const org = organizationId
      ? await this.prisma.organization.findUnique({ where: { id: organizationId } })
      : // Fallback for pre-tenancy tokens/dev tooling: oldest row.
        await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) {
      throw new NotFoundException('Organization not configured');
    }
    return org;
  }

  async get(): Promise<OrganizationResponseDto> {
    return mapLogoFields(await this.current());
  }

  /**
   * Raw logo bytes for a variant — the ONLY place the stored base64 data URI
   * leaves the DB. Public (branding), cacheable.
   */
  async getLogo(slug: string, variant: LogoVariant): Promise<{ mime: string; data: Buffer }> {
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    const raw = org
      ? (org as unknown as Record<string, string | null>)[LOGO_VARIANTS[variant]]
      : null;
    if (!org || !org.isActive || !raw || !raw.startsWith('data:')) {
      throw new NotFoundException('Logo not found');
    }
    const match = raw.match(/^data:([^;]+);base64,(.*)$/s);
    const mime = match?.[1];
    const payload = match?.[2];
    if (!mime || !payload) {
      throw new NotFoundException('Logo not found');
    }
    return { mime, data: Buffer.from(payload, 'base64') };
  }

  /**
   * Public branding lookup by subdomain slug — powers the org-themed login
   * page and landing before any authentication. Returns ONLY branding fields
   * (no legal identity / contacts).
   */
  async getBySlug(slug: string): Promise<PublicOrganizationDto> {
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    if (!org || !org.isActive) {
      throw new NotFoundException('Organization not found');
    }
    return mapLogoFields({
      name: org.name,
      slug: org.slug,
      accentColor: org.accentColor,
      secondaryColor: org.secondaryColor,
      tertiaryColor: org.tertiaryColor,
      brandingTokens: org.brandingTokens as Record<
        string,
        Record<string, string | Record<string, string>>
      > | null,
      fontFamily: org.fontFamily,
      logoUrl: org.logoUrl,
      logoLightUrl: org.logoLightUrl,
      logoDarkUrl: org.logoDarkUrl,
      appLogoLightUrl: org.appLogoLightUrl,
      appLogoDarkUrl: org.appLogoDarkUrl,
    });
  }

  async update(dto: UpdateOrganizationDto): Promise<OrganizationResponseDto> {
    const org = await this.current();

    return mapLogoFields(
      await this.prisma.organization.update({
        where: { id: org.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }),
          ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
          ...(dto.tertiaryColor !== undefined && { tertiaryColor: dto.tertiaryColor }),
          ...(dto.brandingTokens !== undefined && {
            brandingTokens: sanitizeBrandingTokens(dto.brandingTokens) ?? Prisma.DbNull,
          }),
          ...(dto.fontFamily !== undefined && { fontFamily: dto.fontFamily }),
          ...(dto.defaultDeliveryLocationId !== undefined && {
            defaultDeliveryLocationId: dto.defaultDeliveryLocationId,
          }),
          ...(dto.defaultLocationId !== undefined && {
            defaultLocationId: dto.defaultLocationId,
          }),
          ...(dto.appIconName !== undefined && { appIconName: dto.appIconName }),
          ...(dto.nutritionEnabled !== undefined && { nutritionEnabled: dto.nutritionEnabled }),
          ...(dto.wooDeliveryEnabled !== undefined && {
            wooDeliveryEnabled: dto.wooDeliveryEnabled,
          }),
          ...(dto.vatPayer !== undefined && { vatPayer: dto.vatPayer }),
          ...(dto.vatRatePercent !== undefined && { vatRatePercent: dto.vatRatePercent }),
          ...(dto.cui !== undefined && { cui: dto.cui }),
          ...(dto.legalAddress !== undefined && { legalAddress: dto.legalAddress }),
          ...(dto.regCom !== undefined && { regCom: dto.regCom }),
          ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
          ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
          ...(dto.website !== undefined && { website: dto.website }),
          ...(dto.administratorName !== undefined && { administratorName: dto.administratorName }),
        },
      }),
    );
  }

  /** SIMPLIFIED LOGO MODEL: exactly TWO logos per org — light + dark —
   * used everywhere (login, splash, in-app). The old login/app split is
   * retired: writing a scheme sets BOTH its columns (logo* + appLogo*), so
   * every client, old or new, sees the same image; clearing a scheme also
   * clears the legacy shared `logoUrl`, otherwise removal appears to "not
   * work" (clients fall back to the legacy logo and still render one). */
  private logoFields(variant: string): string[] {
    switch (variant) {
      case 'login-light':
      case 'app-light':
      case 'light':
        return ['logoLightUrl', 'appLogoLightUrl'];
      case 'login-dark':
      case 'app-dark':
      case 'dark':
        return ['logoDarkUrl', 'appLogoDarkUrl'];
      default:
        return ['logoUrl'];
    }
  }

  async updateLogo(dataUri: string, variant = 'default'): Promise<OrganizationResponseDto> {
    const org = await this.current();
    const data = Object.fromEntries(this.logoFields(variant).map((f) => [f, dataUri]));
    return mapLogoFields(await this.prisma.organization.update({ where: { id: org.id }, data }));
  }

  async clearLogo(variant: string): Promise<OrganizationResponseDto> {
    const org = await this.current();
    const data = Object.fromEntries(this.logoFields(variant).map((f) => [f, null]));
    if (variant !== 'default') data.logoUrl = null; // legacy fallback must die too
    return mapLogoFields(await this.prisma.organization.update({ where: { id: org.id }, data }));
  }
}
