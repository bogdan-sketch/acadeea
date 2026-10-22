package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

/**
 * One CASL permission rule (action × subject), as sent/returned by the API.
 * `action` can also be "manage" — shorthand for every action on that subject.
 */
@JsonClass(generateAdapter = true)
data class PermissionRule(
    val action: String,
    val subject: String,
)

/** Role as returned by GET /api/v1/roles and GET /api/v1/roles/{id}. */
@JsonClass(generateAdapter = true)
data class RoleResponse(
    val id: String,
    val name: String,
    val slug: String,
    val description: String? = null,
    val isSystem: Boolean = false,
    val userCount: Int = 0,
    val permissions: List<PermissionRule> = emptyList(),
    val createdAt: String? = null,
)

/** Response of GET /api/v1/roles/subjects — the CASL subjects/actions the backend exposes. */
@JsonClass(generateAdapter = true)
data class SubjectsResponse(
    val subjects: List<String>,
    val actions: List<String>,
)

@JsonClass(generateAdapter = true)
data class CreateRoleRequest(
    val name: String,
    val description: String? = null,
)

@JsonClass(generateAdapter = true)
data class UpdateRoleRequest(
    val name: String? = null,
    val description: String? = null,
)

@JsonClass(generateAdapter = true)
data class SetPermissionsRequest(
    val permissions: List<PermissionRule>,
)
