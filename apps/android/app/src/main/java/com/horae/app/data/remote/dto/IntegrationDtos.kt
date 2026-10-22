package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class IntegrationResponseDto(
    val id: String,
    val provider: String,          // EBRIZA | WOOCOMMERCE
    val status: String,            // INACTIVE | ACTIVE | ERROR
    // `config` (arbitrary JSON) is intentionally NOT decoded — Moshi can't map
    // Map<String, Any> and the UI doesn't render it. Unknown keys are ignored.
    val lastSyncAt: String? = null,
    val createdAt: String,
    val updatedAt: String? = null,
    val mappingsCount: Int = 0,
) {
    val providerDisplayName: String get() = when (provider) {
        "EBRIZA" -> "eBriza"
        "WOOCOMMERCE" -> "WooCommerce"
        else -> provider
    }

    val statusDisplayName: String get() = when (status) {
        "ACTIVE" -> "Activ"
        "INACTIVE" -> "Inactiv"
        "ERROR" -> "Eroare"
        else -> status
    }

    val isActive: Boolean get() = status == "ACTIVE"
}

@JsonClass(generateAdapter = true)
data class CreateIntegrationRequest(
    val provider: String,
    val config: Map<String, String>? = null,
)

@JsonClass(generateAdapter = true)
data class UpdateIntegrationRequest(
    val status: String? = null,
    val config: Map<String, String>? = null,
)

@JsonClass(generateAdapter = true)
data class ProductMappingResponseDto(
    val id: String,
    val integrationId: String = "",
    val externalProductId: String = "",
    val externalProductName: String = "",
    val recipeId: String = "",
    val recipeName: String = "",
    val createdAt: String? = null,
)

@JsonClass(generateAdapter = true)
data class CreateProductMappingRequest(
    val externalProductId: String,
    val externalProductName: String,
    val recipeId: String,
)

@JsonClass(generateAdapter = true)
data class ExternalOrderResponseDto(
    val id: String,
    val integrationId: String = "",
    val externalId: String = "",
    val orderId: String? = null,
    val syncStatus: String = "PENDING",
    val errorMessage: String? = null,
    val createdAt: String? = null,
) {
    val syncStatusDisplayName: String get() = when (syncStatus) {
        "PENDING" -> "În așteptare"
        "SYNCED" -> "Sincronizat"
        "FAILED" -> "Eșuat"
        "SKIPPED" -> "Ignorat"
        else -> syncStatus
    }
}

@JsonClass(generateAdapter = true)
data class SyncResultDto(
    val synced: Int = 0,
    val failed: Int = 0,
)
