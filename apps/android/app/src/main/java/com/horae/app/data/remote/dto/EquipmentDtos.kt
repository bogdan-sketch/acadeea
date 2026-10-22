package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class EquipmentResponse(
    val id: String,
    val name: String,
    val type: String,
    val quantity: Int,
    val locationId: String?,
    val locationName: String?,
    val status: String,
    val purchaseDate: String?,
    val warrantyExpiry: String?,
    val notes: String?,
    val createdAt: String,
    val updatedAt: String,
) {
    val statusDisplay: String get() = status.replace("_", " ").lowercase()
        .replaceFirstChar { it.uppercase() }
    val typeDisplay: String get() = type.replace("_", " ").lowercase()
        .replaceFirstChar { it.uppercase() }
}

@JsonClass(generateAdapter = true)
data class MaintenanceLogResponse(
    val id: String,
    val equipmentId: String,
    val description: String,
    val performedById: String,
    val nextScheduled: String?,
    val cost: Double?,
    val createdAt: String,
)

@JsonClass(generateAdapter = true)
data class CreateEquipmentRequest(
    val name: String,
    val type: String,
    val quantity: Int = 1,
    val locationId: String? = null,
    val status: String? = null,
    val notes: String? = null,
)

@JsonClass(generateAdapter = true)
data class CreateMaintenanceLogRequest(
    val description: String,
    val nextScheduled: String? = null,
    val cost: Double? = null,
)
