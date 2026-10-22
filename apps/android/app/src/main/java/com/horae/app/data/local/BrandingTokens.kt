package com.horae.app.data.local

import androidx.compose.ui.graphics.Color
import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber

/**
 * One scheme's parsed Android branding token colors
 * (`Organization.brandingTokens.android.light|dark`). Every field is optional — a null token
 * falls back to the org accent-trio branding, then to the hardcoded defaults (see Theme.kt).
 */
data class BrandingColorSet(
    val accent: Color? = null,
    val accentPressed: Color? = null,
    val textPrimary: Color? = null,
    val textSecondary: Color? = null,
    val background: Color? = null,
    val card: Color? = null,
    val separator: Color? = null,
    val secondary: Color? = null,
    val tertiary: Color? = null,
) {
    val isEmpty: Boolean get() = this == EMPTY

    companion object {
        val EMPTY = BrandingColorSet()
    }
}

/** Both schemes of the `android` platform block. */
data class AndroidBrandingTokens(
    val light: BrandingColorSet = BrandingColorSet.EMPTY,
    val dark: BrandingColorSet = BrandingColorSet.EMPTY,
) {
    fun forScheme(darkTheme: Boolean): BrandingColorSet = if (darkTheme) dark else light

    val isEmpty: Boolean get() = light.isEmpty && dark.isEmpty
}

/**
 * Parsing/serialization helpers for `Organization.brandingTokens` (Json column). The stored shape
 * per platform is `{ light?: ColorSet, dark?: ColorSet, radius… }`; LEGACY data may carry flat
 * color keys directly on the platform object — flat applies to BOTH schemes, scheme-specific wins
 * (mirrors the API's sanitizeBrandingTokens upgrade in organization.service.ts).
 */
object BrandingTokens {

    const val PLATFORM_ANDROID = "android"
    const val SCHEME_LIGHT = "light"
    const val SCHEME_DARK = "dark"
    val SCHEMES = listOf(SCHEME_LIGHT, SCHEME_DARK)

    /** The 9 color token keys — MUST mirror the API whitelist (BRANDING_COLOR_KEYS). */
    val COLOR_KEYS = listOf(
        "accent",
        "accentPressed",
        "textPrimary",
        "textSecondary",
        "background",
        "card",
        "separator",
        "secondary",
        "tertiary",
    )

    /** Same accepted formats as the API: #RGB / #RRGGBB / #RRGGBBAA. */
    val HEX_REGEX = Regex("^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

    /** Extract + parse the `android` block; null when absent/empty (→ trio/default fallback). */
    fun parseAndroid(brandingTokens: Map<String, Any?>?): AndroidBrandingTokens? {
        val platform = brandingTokens?.get(PLATFORM_ANDROID) as? Map<*, *> ?: return null
        val tokens = AndroidBrandingTokens(
            light = colorSetOf(effectiveHexMap(platform, SCHEME_LIGHT)),
            dark = colorSetOf(effectiveHexMap(platform, SCHEME_DARK)),
        )
        return tokens.takeUnless { it.isEmpty }
    }

    /**
     * Raw hex per token key for one scheme, with legacy flat platform-level colors folded in
     * (scheme-specific values win). Only valid hex values are kept.
     */
    fun effectiveHexMap(platform: Map<*, *>, scheme: String): Map<String, String> {
        val out = mutableMapOf<String, String>()
        collectHexes(platform, out) // legacy flat keys → both schemes
        (platform[scheme] as? Map<*, *>)?.let { collectHexes(it, out) } // scheme wins
        return out
    }

    private fun collectHexes(source: Map<*, *>, out: MutableMap<String, String>) {
        for (key in COLOR_KEYS) {
            val value = (source[key] as? String)?.trim() ?: continue
            if (HEX_REGEX.matches(value)) out[key] = value
        }
    }

    private fun colorSetOf(hexes: Map<String, String>): BrandingColorSet = BrandingColorSet(
        accent = BrandingManager.parseHexColorOrNull(hexes["accent"]),
        accentPressed = BrandingManager.parseHexColorOrNull(hexes["accentPressed"]),
        textPrimary = BrandingManager.parseHexColorOrNull(hexes["textPrimary"]),
        textSecondary = BrandingManager.parseHexColorOrNull(hexes["textSecondary"]),
        background = BrandingManager.parseHexColorOrNull(hexes["background"]),
        card = BrandingManager.parseHexColorOrNull(hexes["card"]),
        separator = BrandingManager.parseHexColorOrNull(hexes["separator"]),
        secondary = BrandingManager.parseHexColorOrNull(hexes["secondary"]),
        tertiary = BrandingManager.parseHexColorOrNull(hexes["tertiary"]),
    )

    // ── JSON ↔ Map (SharedPreferences persistence + read-modify-write PATCH) ──────────────

    fun toJsonString(map: Map<String, Any?>): String = JSONObject(map).toString()

    fun fromJsonString(json: String?): MutableMap<String, Any?>? {
        if (json.isNullOrBlank()) return null
        return try {
            jsonToMap(JSONObject(json))
        } catch (e: Exception) {
            Timber.w(e, "BrandingTokens: invalid persisted brandingTokens JSON")
            null
        }
    }

    private fun jsonToMap(obj: JSONObject): MutableMap<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        for (key in obj.keys()) {
            map[key] = when (val value = obj.get(key)) {
                is JSONObject -> jsonToMap(value)
                is JSONArray -> jsonToList(value)
                JSONObject.NULL -> null
                else -> value
            }
        }
        return map
    }

    private fun jsonToList(array: JSONArray): List<Any?> = (0 until array.length()).map { i ->
        when (val value = array.get(i)) {
            is JSONObject -> jsonToMap(value)
            is JSONArray -> jsonToList(value)
            JSONObject.NULL -> null
            else -> value
        }
    }
}
