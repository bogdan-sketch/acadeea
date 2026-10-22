package com.horae.app.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import com.horae.app.data.remote.dto.OrganizationBranding
import com.horae.app.ui.theme.SchemeStore
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Organisation identity cached on the device: name, slug, logos (light + dark)
 * and the default location.
 *
 * Since the 17.10.2026 redesign the organisation NO LONGER themes the app: no
 * accent, secondary/tertiary colour, font or `brandingTokens` reach the UI —
 * colours come only from the six schemes (`ui/theme/AppScheme`, per device).
 * Branding survives logout (the device keeps the last org's logo/name until a
 * different org signs in).
 */
@Singleton
class BrandingManager @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)

    var organizationName by mutableStateOf(prefs.getString(KEY_ORG_NAME, DEFAULT_NAME) ?: DEFAULT_NAME)
        private set

    var organizationSlug by mutableStateOf(prefs.getString(KEY_ORG_SLUG, null))
        private set

    /** Logo for light schemes (`Organization.logoLightUrl`): a data URI or an https URL; null = none. */
    var logoLightUrl by mutableStateOf(prefs.getString(KEY_LOGO_LIGHT_URL, null))
        private set

    /** Logo for dark schemes (`Organization.logoDarkUrl`); null = none. */
    var logoDarkUrl by mutableStateOf(prefs.getString(KEY_LOGO_DARK_URL, null))
        private set

    /** Legacy single logo (`Organization.logoUrl`) — not used for display (iOS/web use light/dark only). */
    var logoUrl by mutableStateOf(prefs.getString(KEY_LOGO_URL, null))
        private set

    /** Admin-set location every operation starts on (null = none); see OrganizationRepository.setDefaultLocation. */
    var defaultLocationId by mutableStateOf(prefs.getString(KEY_DEFAULT_LOCATION_ID, null))
        private set

    /**
     * "Livrări din magazinul online" (`Organization.wooDeliveryEnabled`): gates delivery-method
     * filters/short names in Comenzi and the main-unit badge on locations. Prefs-cached.
     */
    var wooDeliveryEnabled by mutableStateOf(prefs.getBoolean(KEY_WOO_DELIVERY, false))
        private set

    /**
     * The org logo for a light or dark scheme — STRICTLY logoLightUrl / logoDarkUrl
     * (same rule as iOS: no fallback onto legacy fields). Null → show the org name
     * in Fraunces instead.
     */
    fun logoFor(dark: Boolean): String? = (if (dark) logoDarkUrl else logoLightUrl)?.takeIf { it.isNotBlank() }

    // ── Legacy branding fields ────────────────────────────────────────────
    // Kept ONLY so the old Branding settings screen (slice B turns it into
    // "Identitate": logo light + dark) still compiles. They never theme the app.

    /** Raw `brandingTokens` JSON as received (read-modify-write for the legacy settings screen). */
    @Deprecated("Org tokens no longer theme the app")
    var brandingTokensRaw by mutableStateOf(prefs.getString(KEY_BRANDING_TOKENS, null))
        private set

    @Deprecated("Org colours no longer theme the app; use HoraeTheme.scheme.primary")
    val accentColor: Color get() = SchemeStore.scheme.primary

    @Deprecated("Org colours no longer theme the app")
    var secondaryColorHex by mutableStateOf(prefs.getString(KEY_SECONDARY_COLOR, null))
        private set

    @Deprecated("Org colours no longer theme the app")
    var tertiaryColorHex by mutableStateOf(prefs.getString(KEY_TERTIARY_COLOR, null))
        private set

    @Deprecated("Org fonts no longer apply; the app always uses DM Sans + Fraunces")
    var fontFamily by mutableStateOf(prefs.getString(KEY_FONT_FAMILY, null))
        private set

    @Suppress("DEPRECATION")
    @Deprecated("Org tokens no longer theme the app")
    fun brandingTokensAsMap(): MutableMap<String, Any?>? = BrandingTokens.fromJsonString(brandingTokensRaw)

    @Suppress("DEPRECATION")
    fun apply(branding: OrganizationBranding) {
        Timber.d("BrandingManager: apply org=${branding.name}")
        val tokensJson = branding.brandingTokens?.let { BrandingTokens.toJsonString(it) }
        prefs.edit()
            .putString(KEY_ORG_NAME, branding.name)
            .putString(KEY_ORG_SLUG, branding.slug)
            .putString(KEY_LOGO_URL, branding.logoUrl)
            .putString(KEY_LOGO_LIGHT_URL, branding.logoLightUrl)
            .putString(KEY_LOGO_DARK_URL, branding.logoDarkUrl)
            .putString(KEY_DEFAULT_LOCATION_ID, branding.defaultLocationId)
            .putBoolean(KEY_WOO_DELIVERY, branding.wooDeliveryEnabled == true)
            .putString(KEY_SECONDARY_COLOR, branding.secondaryColor)
            .putString(KEY_TERTIARY_COLOR, branding.tertiaryColor)
            .putString(KEY_FONT_FAMILY, branding.fontFamily)
            .putString(KEY_BRANDING_TOKENS, tokensJson) // null value removes the key
            .apply()

        organizationName = branding.name
        organizationSlug = branding.slug
        logoUrl = branding.logoUrl
        logoLightUrl = branding.logoLightUrl
        logoDarkUrl = branding.logoDarkUrl
        defaultLocationId = branding.defaultLocationId
        wooDeliveryEnabled = branding.wooDeliveryEnabled == true
        secondaryColorHex = branding.secondaryColor
        tertiaryColorHex = branding.tertiaryColor
        fontFamily = branding.fontFamily
        brandingTokensRaw = tokensJson
    }

    /** Wipe the cached org identity (neutral "Horae"). The scheme is per device and is NOT touched. */
    @Suppress("DEPRECATION")
    fun clear() {
        Timber.d("BrandingManager: clear to neutral Horae defaults")
        prefs.edit().clear().apply()
        organizationName = DEFAULT_NAME
        organizationSlug = null
        logoUrl = null
        logoLightUrl = null
        logoDarkUrl = null
        defaultLocationId = null
        wooDeliveryEnabled = false
        secondaryColorHex = null
        tertiaryColorHex = null
        fontFamily = null
        brandingTokensRaw = null
    }

    companion object {
        private const val PREFS_FILE = "acadeea_branding"
        private const val KEY_SECONDARY_COLOR = "secondary_color"
        private const val KEY_TERTIARY_COLOR = "tertiary_color"
        private const val KEY_LOGO_URL = "logo_url"
        private const val KEY_LOGO_LIGHT_URL = "logo_light_url"
        private const val KEY_LOGO_DARK_URL = "logo_dark_url"
        private const val KEY_ORG_NAME = "org_name"
        private const val KEY_ORG_SLUG = "org_slug"
        private const val KEY_DEFAULT_LOCATION_ID = "default_location_id"
        private const val KEY_WOO_DELIVERY = "woo_delivery_enabled"
        private const val KEY_FONT_FAMILY = "font_family"
        private const val KEY_BRANDING_TOKENS = "branding_tokens"

        val DEFAULT_NAME = com.horae.app.BuildConfig.BRAND_NAME

        /** Fallback colour for [parseHexColor] (category colours, legacy screens). */
        val DEFAULT_ACCENT = Color(0xFFC2305B)

        fun parseHexColor(hex: String?): Color =
            parseHexColorOrNull(hex) ?: DEFAULT_ACCENT

        /** Accepts #RGB, #RRGGBB and #RRGGBBAA (same formats the API whitelists). */
        fun parseHexColorOrNull(hex: String?): Color? {
            if (hex.isNullOrBlank()) return null
            return try {
                val cleaned = hex.trim().removePrefix("#")
                val argb = when (cleaned.length) {
                    3 -> "FF" + cleaned.map { "$it$it" }.joinToString("")
                    6 -> "FF$cleaned"
                    8 -> cleaned.substring(6, 8) + cleaned.substring(0, 6) // #RRGGBBAA → AARRGGBB
                    else -> return null
                }
                Color(argb.toLong(16))
            } catch (e: Exception) {
                Timber.w("BrandingManager: invalid hex color '$hex'")
                null
            }
        }
    }
}
