package com.horae.app.testutil

import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.remote.dto.OrderItemResponseDto
import com.horae.app.data.remote.dto.OrderResponse
import com.horae.app.data.remote.dto.OrderUserDto
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.RawMaterialResponse
import com.horae.app.data.remote.dto.RecipeListItemDto
import com.horae.app.data.remote.dto.TaskResponse
import com.horae.app.data.remote.dto.TaskUserDto

/** Small DTO builders for tests — only the fields a test cares about are named. */
object Fixtures {

    fun <T> page(data: List<T>, page: Int = 1, totalPages: Int = 1, total: Int = data.size) =
        PaginatedResponse(data = data, total = total, page = page, limit = 20, totalPages = totalPages)

    fun item(
        name: String,
        quantity: Double = 1.0,
        unit: String = "BUCATI",
        id: String = "i-$name",
        label: String? = null,
    ) = OrderItemResponseDto(
        id = id, recipeId = "r-$name", recipeName = name, label = label, quantity = quantity,
        unit = unit, status = "IN_PREGATIRE", notes = null,
    )

    fun order(
        id: String,
        orderNumber: String = "CMD-$id",
        createdAt: String = "2026-10-17T08:00:00.000Z",
        status: String = "NOUA",
        items: List<OrderItemResponseDto> = emptyList(),
        itemCount: Int = items.size,
        customerName: String? = null,
        deliveryPoint: String = "Magazin Centru",
        fulfillmentType: String = "DELIVERY",
        dueDate: String? = null,
        externalStatus: String? = null,
    ) = OrderResponse(
        id = id, orderNumber = orderNumber, status = status, fulfillmentType = fulfillmentType,
        deliveryPoint = deliveryPoint, deliveryAddress = null, customerName = customerName,
        externalStatus = externalStatus, notes = null, dueDate = dueDate, createdById = "u1",
        assignedToId = null, createdAt = createdAt, updatedAt = createdAt, completedAt = null,
        createdBy = OrderUserDto("u1", "Ana", "Pop"), assignedTo = null, items = items,
        deliveryNote = null, itemCount = itemCount,
    )

    fun task(
        id: String,
        status: String = "DE_FACUT",
        recipeName: String = "Tort $id",
        targetQuantity: Double = 1.0,
        targetUnit: String = "BUCATI",
        dueDate: String? = null,
        title: String? = null,
        completedAt: String? = null,
    ) = TaskResponse(
        id = id, recipeId = "r-$id", scaleFactor = 1.0, targetQuantity = targetQuantity, targetUnit = targetUnit,
        status = status, priority = 0, dueDate = dueDate, notes = null, createdById = "u1", assignedToId = null,
        startedAt = null, completedAt = completedAt, cancelledAt = null, cancelReason = null, actualYield = null,
        varianceAbsolute = null, variancePercent = null, recipeName = recipeName, title = title,
        createdBy = TaskUserDto("u1", "Ana", "Pop"), assignedTo = TaskUserDto("u2", "Ion", "Dima"),
        statusHistory = emptyList(), createdAt = "2026-10-17T06:00:00Z", updatedAt = "2026-10-17T06:00:00Z",
    )

    fun recipe(id: String, name: String = "Rețeta $id", unit: String = "BUCATI", type: String = "FINAL", archived: Boolean = false) =
        RecipeListItemDto(id = id, name = name, unit = unit, type = type, isArchived = archived)

    fun location(id: String, name: String = "Loc $id", active: Boolean = true, type: String = "MAGAZIN") =
        LocationResponse(id, name, type, "Str. 1", null, active, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")

    fun material(
        id: String,
        title: String = "Material $id",
        unit: String = "KILOGRAME",
        stock: Double = 10.0,
        minimum: Double = 0.0,
        status: String = "ACTIVE",
        pieceType: String? = null,
    ) = RawMaterialResponse(
        id = id, title = title, producer = null, unit = unit, quantityPerPiece = 1.0, pieceType = pieceType,
        stockCount = stock, openedCount = 0.0, orderedCount = 0.0, reservedCount = 0.0, storageType = "WARM",
        status = status, minimumStock = minimum, createdAt = "2026-01-01T00:00:00Z", updatedAt = "2026-01-01T00:00:00Z",
    )
}
