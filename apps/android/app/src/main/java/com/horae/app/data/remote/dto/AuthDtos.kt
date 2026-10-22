package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class LoginRequest(
    val email: String,
    val password: String,
)

@JsonClass(generateAdapter = true)
data class RefreshTokenRequest(
    val refreshToken: String,
)

@JsonClass(generateAdapter = true)
data class ForgotPasswordRequest(
    val email: String,
)

@JsonClass(generateAdapter = true)
data class DeleteAccountRequest(
    val password: String,
)

@JsonClass(generateAdapter = true)
data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val user: AuthUser,
    /** Tenant branding, included in the login response since the Horae rebrand. */
    val organization: OrganizationBranding? = null,
    // NOTE: the response also carries a web-only `handoffCode` — Moshi ignores unknown keys.
)

/** Rol dinamic (per-tenant): API-ul trimite un OBIECT {slug, name} de la
 *  migrarea multi-tenant — nu un string. String-ul vechi crăpa login-ul cu
 *  "Expected a string but was BEGIN_OBJECT" (defectul confirmat în PR#26). */
@JsonClass(generateAdapter = true)
data class RoleRef(
    val slug: String? = null,
    val name: String? = null,
)

@JsonClass(generateAdapter = true)
data class AuthUser(
    val id: String,
    val email: String,
    val firstName: String,
    val lastName: String,
    val role: RoleRef? = null,
    /** Profile photo (data URI or URL), null when none. */
    val avatarUrl: String? = null,
    /** Tenant branding, included in GET /auth/me since the Horae rebrand. */
    val organization: OrganizationBranding? = null,
)

@JsonClass(generateAdapter = true)
data class TokenResponse(
    val accessToken: String,
    val refreshToken: String,
)
