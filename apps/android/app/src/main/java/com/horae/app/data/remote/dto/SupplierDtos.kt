package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

/**
 * `GET /api/v1/suppliers` row. The pickers only read id + name; the Furnizori screen also
 * shows contact details and the supplier's materials (all optional for older payloads).
 */
@JsonClass(generateAdapter = true)
data class SupplierDto(
    val id: String,
    val name: String,
    val contactPerson: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val notes: String? = null,
    val materialCount: Int = 0,
    val lowStockCount: Int = 0,
    val materials: List<SupplierMaterialDto> = emptyList(),
)

/** A raw material bought from a supplier; quantities are in the material's own [unit]. */
@JsonClass(generateAdapter = true)
data class SupplierMaterialDto(
    val id: String,
    val title: String,
    val unit: String,
    val stockCount: Double = 0.0,
    val minimumStock: Double = 0.0,
    val status: String = "ACTIVE",
    val isLow: Boolean = false,
)
