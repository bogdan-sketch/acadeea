package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass


/** GET /organization — white-label branding (mirrors OrganizationResponseDto). */
@JsonClass(generateAdapter = true)
data class OrganizationBranding(
    val id: String,
    val name: String,
    /** Tenant slug (e.g. "acadeea") — white-label identifier. */
    val slug: String? = null,
    val accentColor: String? = null,
    /** 2nd data-series/highlight color, hex (null = client default blue #007AFF). */
    val secondaryColor: String? = null,
    /** 3rd data-series color, hex (null = client default purple #AF52DE). */
    val tertiaryColor: String? = null,
    /** "inter" | "manrope" | "lora" | "poppins" | "system" (null = system). */
    val fontFamily: String? = null,
    /**
     * Extended per-platform token overrides: `{ web?|ios?|android?: { light?: ColorSet,
     * dark?: ColorSet, radius… } }` (legacy stored data may carry flat color keys on the platform
     * object — they apply to BOTH schemes, scheme-specific wins). Android consumes ONLY the
     * `android` block; the raw map is kept whole for read-modify-write PATCHes (other platforms
     * must be preserved). Parsed by [com.horae.app.data.local.BrandingTokens].
     */
    val brandingTokens: Map<String, Any?>? = null,
    val logoUrl: String? = null,
    val logoLightUrl: String? = null,
    val logoDarkUrl: String? = null,
    val appLogoLightUrl: String? = null,
    val appLogoDarkUrl: String? = null,
    val appIconName: String? = null,
    val nutritionEnabled: Boolean? = null,
    /**
     * "Livrări din magazinul online" switch: Woo delivery date + method import, location
     * externalId / main unit, delivery-method filters in Comenzi. Null (older API) = off.
     */
    val wooDeliveryEnabled: Boolean? = null,
    /** Admin-set location every operation starts on (Stoc › Locații › Implicită); null = none. */
    val defaultLocationId: String? = null,
    // Company data printed on documents (Profil › Setări › Companie).
    val cui: String? = null,
    val regCom: String? = null,
    val legalAddress: String? = null,
    val contactPhone: String? = null,
    val contactEmail: String? = null,
    val website: String? = null,
    val administratorName: String? = null,
    val vatPayer: Boolean? = null,
    val vatRatePercent: Double? = null,
)

/** PATCH /organization for the Companie form — only company fields, branding untouched. */
@JsonClass(generateAdapter = true)
data class UpdateCompanyRequest(
    val name: String,
    val cui: String,
    val regCom: String,
    val legalAddress: String,
    val contactPhone: String,
    val contactEmail: String,
    val website: String,
    val administratorName: String,
    val vatPayer: Boolean,
    val vatRatePercent: Double,
)

/** An org snapshot (GET /backups/snapshots, root only). */
@JsonClass(generateAdapter = true)
data class OrgSnapshotDto(
    val id: String,
    val label: String? = null,
    val auto: Boolean = false,
    val createdByName: String? = null,
    val createdAt: String,
)

@JsonClass(generateAdapter = true)
data class CreateSnapshotRequest(
    val label: String? = null,
)

/**
 * PATCH /organization { defaultLocationId } on its own: the id to set, or explicit null to clear.
 * Kept apart from [UpdateOrganizationRequest] so branding saves never touch the default location.
 */
@JsonClass(generateAdapter = true)
data class UpdateDefaultLocationRequest(
    @SerializeNulls val defaultLocationId: String?,
)

/** PATCH /organization { wooDeliveryEnabled } on its own (Profil › Setări › Comenzi din site). */
@JsonClass(generateAdapter = true)
data class UpdateWooDeliveryRequest(
    val wooDeliveryEnabled: Boolean,
)

@JsonClass(generateAdapter = true)
data class UpdateOrganizationRequest(
    val name: String? = null,
    val accentColor: String? = null,
    /** PATCH semantics: explicit `null` resets to the default palette, so nulls are serialized. */
    @SerializeNulls val secondaryColor: String? = null,
    @SerializeNulls val tertiaryColor: String? = null,
    /**
     * FULL multi-platform token object (read-modify-write — callers must merge their platform
     * block into the stored value, never send a partial map). ⚠️ Serialized even when null
     * (explicit null clears every platform's overrides server-side) — only pass a value you
     * really computed; merge into the stored value first.
     */
    @SerializeNulls val brandingTokens: Map<String, Any?>? = null,
    /** Predefined key ("inter"/"manrope"/"lora"/"poppins"/"system"); omitted when null. */
    val fontFamily: String? = null,
)

@JsonClass(generateAdapter = true)
data class OrgSuperCategoryDto(
    val kind: String,
    val name: String,
)

@JsonClass(generateAdapter = true)
data class OrgCategoryDto(
    val name: String,
    val kind: String,
    val parentName: String? = null,
)
