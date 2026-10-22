package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class OrderResponse(
    val id: String,
    val orderNumber: String,
    val status: String,
    /** DELIVERY (driver) | PICKUP (customer collects at [pickupLocationId]). */
    val fulfillmentType: String = "DELIVERY",
    val pickupLocationId: String? = null,
    val deliveryPoint: String,
    val deliveryAddress: String?,
    /** Customer (WooCommerce billing name for site orders); null for most manual orders. */
    val customerName: String? = null,
    /** Status in the shop for imported orders ("processing"); null for manual ones. */
    val externalStatus: String? = null,
    /** Delivery method chosen in the shop for imported Woo orders ("Ridicare Napoca 15"); read-only. */
    val deliveryMethod: String? = null,
    val notes: String?,
    val dueDate: String?,
    val createdById: String,
    val assignedToId: String?,
    val createdAt: String,
    val updatedAt: String,
    val completedAt: String?,
    val createdBy: OrderUserDto,
    val assignedTo: OrderUserDto?,
    val items: List<OrderItemResponseDto>,
    val deliveryNote: DeliveryNoteResponseDto?,
    val itemCount: Int,
)

@JsonClass(generateAdapter = true)
data class OrderUserDto(
    val id: String,
    val firstName: String,
    val lastName: String,
) {
    val fullName: String get() = "$firstName $lastName"
}

@JsonClass(generateAdapter = true)
data class OrderItemResponseDto(
    val id: String,
    // Null for external (Woo) items without a product mapping — recipeName
    // then carries the site's product name (server-side label fallback).
    val recipeId: String?,
    val recipeName: String,
    /** Free-text product name for unmapped site products. */
    val label: String? = null,
    val quantity: Double,
    val unit: String,
    val status: String,
    val notes: String?,
)

@JsonClass(generateAdapter = true)
data class DeliveryNoteResponseDto(
    val id: String,
    val deliveryAddress: String,
    val deliveryPoint: String,
    val signedByName: String?,
    val signedAt: String?,
    val hasSignature: Boolean,
    val notes: String?,
    val generatedAt: String,
)

@JsonClass(generateAdapter = true)
data class CreateOrderRequest(
    val deliveryPoint: String,
    /** "PICKUP" for Ridicare; null = server default (DELIVERY). */
    val fulfillmentType: String? = null,
    /** Pickup location (only with fulfillmentType = PICKUP). */
    val pickupLocationId: String? = null,
    val deliveryAddress: String? = null,
    val notes: String? = null,
    val dueDate: String? = null,
    val items: List<CreateOrderItemRequest>,
)

@JsonClass(generateAdapter = true)
data class CreateOrderItemRequest(
    val recipeId: String,
    val quantity: Double,
    val unit: String,
)

@JsonClass(generateAdapter = true)
data class UpdateOrderRequest(
    val status: String? = null,
    val deliveryPoint: String? = null,
    val deliveryAddress: String? = null,
    val notes: String? = null,
    val assignedToId: String? = null,
    val dueDate: String? = null,
)

@JsonClass(generateAdapter = true)
data class AddOrderItemRequest(
    val recipeId: String,
    val quantity: Double,
    val unit: String,
)

@JsonClass(generateAdapter = true)
data class UpdateOrderItemRequest(
    val quantity: Double? = null,
    val unit: String? = null,
    val status: String? = null,
    val notes: String? = null,
)

/** GET /orders/stats — aggregate order stats (mirrors OrderStatsResponseDto). */
@JsonClass(generateAdapter = true)
data class OrderStatsResponseDto(
    val totalOrders: Int,
    val completedOrders: Int,
    val statusCounts: Map<String, Int> = emptyMap(),
    val deliveryPointCounts: List<DeliveryPointCount> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class DeliveryPointCount(
    val deliveryPoint: String,
    val count: Int,
)

/** GET /orders/delivery-methods — shop delivery methods, most used first. */
@JsonClass(generateAdapter = true)
data class DeliveryMethodDto(
    /** Method exactly as imported (the `deliveryMethod` filter value). */
    val name: String,
    /** Admin short name; null = none. */
    val shortName: String? = null,
    /** What the UI shows: shortName ?: name without a leading "Ridicare la / de la / din" (server-side). */
    val label: String = shortName ?: name,
    /** [DeliveryMethodKind] apiValue: PICKUP (Ridicare) | DELIVERY (Livrare). */
    val kind: String = DeliveryMethodKind.PICKUP.name,
    /** True = admin-assigned [kind]; false = auto-detected. */
    val kindSet: Boolean = false,
    /** Active orders with this method. */
    val count: Int = 0,
) {
    val kindEnum: DeliveryMethodKind
        get() = if (kind == DeliveryMethodKind.DELIVERY.name) DeliveryMethodKind.DELIVERY else DeliveryMethodKind.PICKUP
}

/** Ridicare (customer collects) | Livrare (delivered) — a delivery method's kind. */
enum class DeliveryMethodKind(val label: String) { PICKUP("Ridicare"), DELIVERY("Livrare") }

/**
 * PUT /orders/delivery-methods/alias — short name only (kind untouched). "" clears it (back to
 * the default label).
 */
@JsonClass(generateAdapter = true)
data class DeliveryMethodAliasRequest(
    val name: String,
    val shortName: String,
)

/** PUT /orders/delivery-methods/alias — kind only (short name untouched). null = back to auto. */
@JsonClass(generateAdapter = true)
data class DeliveryMethodKindRequest(
    val name: String,
    @SerializeNulls val kind: String?,
)
