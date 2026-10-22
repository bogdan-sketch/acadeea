package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class UserResponse(
    val id: String,
    val email: String,
    val firstName: String,
    val lastName: String,
    /** Obiect {slug, name} de la rolurile dinamice — vezi RoleRef. */
    val role: RoleRef? = null,
    val isActive: Boolean,
    val createdAt: String,
) {
    val fullName: String get() = "$firstName $lastName"
}

@JsonClass(generateAdapter = true)
data class InviteUserRequest(
    val email: String,
    val role: String,
)

@JsonClass(generateAdapter = true)
data class ChangeRoleRequest(
    val role: String,
)

@JsonClass(generateAdapter = true)
data class InvitationResponse(
    val id: String,
    val email: String,
    val role: String,
    val createdById: String,
    val expiresAt: String,
    val acceptedAt: String?,
    val createdAt: String,
)

@JsonClass(generateAdapter = true)
data class UpdateUserNameRequest(
    val firstName: String,
    val lastName: String,
)
