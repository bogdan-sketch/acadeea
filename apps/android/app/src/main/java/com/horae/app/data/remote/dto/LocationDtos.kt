package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class LocationResponse(
    val id: String,
    val name: String,
    val type: String,
    val address: String,
    val phone: String?,
    val isActive: Boolean,
    val createdAt: String,
    val updatedAt: String,
    /** Id of this location in the WooCommerce delivery plugin (Pickupia); unique per org. */
    val externalId: String? = null,
    /** Main unit: site sales are deducted from its stock (shown only with wooDeliveryEnabled). */
    val isMainUnit: Boolean = false,
)

@JsonClass(generateAdapter = true)
data class LocationStockResponse(
    val id: String,
    val locationId: String,
    val rawMaterialId: String,
    val rawMaterialTitle: String,
    val category: String? = null,
    val unit: String,
    val quantity: Double,
    val updatedAt: String,
)

@JsonClass(generateAdapter = true)
data class LocationUserResponse(
    val id: String,
    val userId: String,
    val firstName: String,
    val lastName: String,
    val role: String,
    val isPrimary: Boolean,
    val createdAt: String,
) {
    val fullName: String get() = "$firstName $lastName"
}

@JsonClass(generateAdapter = true)
data class AssignUserLocationRequest(
    val userId: String,
    val isPrimary: Boolean = false,
)

@JsonClass(generateAdapter = true)
data class UpdateTransferApprovalRequest(
    val status: String,
    val reason: String? = null,
)

@JsonClass(generateAdapter = true)
data class LocationDashboardResponse(
    val locationId: String,
    val locationName: String,
    val totalMaterials: Int,
    val assignedUsers: Int,
    val pendingInboundTransfers: Int,
    val pendingOutboundTransfers: Int,
    val lowStockMaterials: List<LocationDashboardMaterial>,
)

@JsonClass(generateAdapter = true)
data class LocationDashboardMaterial(
    val rawMaterialId: String,
    val title: String,
    val quantity: Double,
    val unit: String,
)

@JsonClass(generateAdapter = true)
data class TransferResponse(
    val id: String,
    val status: String,
    val notes: String? = null,
    // Nullable-tolerant: ad-hoc destinations synthesize toLocation with empty
    // fields, and a location's address can be null — required non-nulls made
    // the transfers list throw a decode error.
    val fromLocation: TransferLocationDto? = null,
    val toLocation: TransferLocationDto? = null,
    val createdBy: TransferUserDto? = null,
    val items: List<TransferItemResponse> = emptyList(),
    val completedAt: String? = null,
    val createdAt: String,
    val updatedAt: String? = null,
)

@JsonClass(generateAdapter = true)
data class TransferLocationDto(
    val id: String? = null,
    val name: String? = null,
    val address: String? = null,
)

@JsonClass(generateAdapter = true)
data class TransferUserDto(
    val id: String,
    val firstName: String? = null,
    val lastName: String? = null,
) {
    val fullName: String get() = "${firstName ?: ""} ${lastName ?: ""}".trim()
}

@JsonClass(generateAdapter = true)
data class TransferItemResponse(
    val id: String,
    val rawMaterialId: String? = null,
    val rawMaterialTitle: String? = null,
    val quantity: Double = 0.0,
    val unit: String? = null,
)

@JsonClass(generateAdapter = true)
data class CreateLocationRequest(
    val name: String,
    val type: String,
    val address: String,
    val phone: String? = null,
    /** Pickupia delivery-method id; empty string clears it (PATCH). Duplicate → 409. */
    val externalId: String? = null,
    /** Main unit flag (create/PATCH, optional). */
    val isMainUnit: Boolean? = null,
)

@JsonClass(generateAdapter = true)
data class CreateTransferRequest(
    val fromLocationId: String,
    val toLocationId: String,
    val notes: String? = null,
    val items: List<TransferItemRequest>,
)

@JsonClass(generateAdapter = true)
data class TransferItemRequest(
    val rawMaterialId: String,
    val quantity: Double,
    val unit: String,
)

@JsonClass(generateAdapter = true)
data class UpdateTransferStatusRequest(
    val status: String,
)

// ── Transfer documents: aviz de însoțire + declarație de conformitate ──
// Printable payloads (GET .../aviz and .../conformity), rendered to HTML +
// printed via Android's PrintManager. Mirrors iOS TransferAviz/Conformity.

@JsonClass(generateAdapter = true)
data class TransferAvizDto(
    val serial: String = "",
    val issuedAt: String = "",
    val transferId: String = "",
    val supplier: AvizPartyDto? = null,
    val buyer: AvizPartyDto? = null,
    val delegateName: String? = null,
    val recipientName: String? = null,
    val items: List<AvizItemDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class AvizPartyDto(
    val name: String = "",
    val address: String? = null,
    val cui: String? = null,
    val locationName: String = "",
)

@JsonClass(generateAdapter = true)
data class AvizItemDto(
    val name: String = "",
    val quantity: Double = 0.0,
    val unit: String = "BUCATI",
    val unitPrice: Double? = null,
)

@JsonClass(generateAdapter = true)
data class TransferConformityDto(
    val serial: String = "",
    val issuedAt: String = "",
    val transferId: String = "",
    val deliveredTo: String = "",
    val deliveryDate: String = "",
    val organization: ConformityOrgDto? = null,
    val items: List<ConformityItemDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class ConformityOrgDto(
    val name: String = "",
    val legalAddress: String? = null,
    val cui: String? = null,
    val regCom: String? = null,
    val contactPhone: String? = null,
    val contactEmail: String? = null,
    val website: String? = null,
    val administratorName: String? = null,
)

@JsonClass(generateAdapter = true)
data class ConformityItemDto(
    val name: String = "",
    val quantity: Double = 0.0,
    val unit: String = "BUCATI",
)
