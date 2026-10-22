package com.horae.app.domain.model

/**
 * The signed-in user. [role] is the closest LEGACY role (drives tabs and
 * PermissionManager); for DISPLAY use [roleLabel] — the tenant role name from the
 * API ("Gestionar"), falling back to the legacy label.
 */
data class User(
    val id: String,
    val email: String,
    val firstName: String,
    val lastName: String,
    val role: UserRole,
    /** Tenant role slug from the API ("gestionar"), null when unknown. */
    val roleSlug: String? = null,
    /** Tenant role name from the API ("Gestionar"), null when unknown. */
    val roleName: String? = null,
    /** Profile photo: data URI or https URL, null = show [initials]. */
    val avatarUrl: String? = null,
) {
    val fullName: String get() = "$firstName $lastName".trim()

    /** Role as shown in the UI. */
    val roleLabel: String get() = roleName?.takeIf { it.isNotBlank() } ?: role.displayName

    /** "AP" for Anca Pop; email initial when the name is empty. */
    val initials: String
        get() {
            val letters = listOf(firstName, lastName).mapNotNull { it.trim().firstOrNull()?.uppercaseChar() }
            return letters.joinToString("").ifEmpty { email.firstOrNull()?.uppercase() ?: "?" }
        }
}
