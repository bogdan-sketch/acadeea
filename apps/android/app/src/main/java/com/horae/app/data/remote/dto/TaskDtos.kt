package com.horae.app.data.remote.dto

import com.horae.app.ui.common.formatQty
import com.horae.app.ui.common.qtyFormatted
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class TaskResponse(
    val id: String,
    val recipeId: String,
    val scaleFactor: Double,
    val targetQuantity: Double,
    val targetUnit: String,
    val status: String,
    val priority: Int,
    val dueDate: String?,
    val notes: String?,
    val createdById: String,
    val assignedToId: String?,
    val startedAt: String?,
    val completedAt: String?,
    val cancelledAt: String?,
    val cancelReason: String?,
    val actualYield: Double?,
    val varianceAbsolute: Double?,
    val variancePercent: Double?,
    val recipeName: String,
    /** Custom name (null = recipe name). */
    val title: String? = null,
    /** ASSIGNED | EVERYONE | SELECTED — who sees it besides managers/admins. */
    val visibility: String? = null,
    /** Extra viewers when visibility = SELECTED. */
    val visibleToIds: List<String>? = null,
    val createdBy: TaskUserDto,
    val assignedTo: TaskUserDto?,
    val statusHistory: List<TaskStatusHistoryDto>,
    val createdAt: String,
    val updatedAt: String,
) {
    /** Custom title when set, else the recipe name. */
    val name: String get() = title?.takeIf { it.isNotBlank() } ?: recipeName
    /** Quantity with its unit: "2 buc", "1,5 kg" (B15 — never a bare "2"). */
    val quantityText: String get() = formatQty(targetQuantity, targetUnit)
    /** Card badge: "×6" for pieces, "2,5 kg" for measured quantities (iOS `QtyBadge`). */
    val quantityBadge: String get() =
        if (targetUnit == "BUCATI") "×${targetQuantity.qtyFormatted()}" else quantityText
    val displayName: String get() = "$quantityText $name"
}

@JsonClass(generateAdapter = true)
data class TaskUserDto(
    val id: String,
    val firstName: String,
    val lastName: String,
) {
    val fullName: String get() = "$firstName $lastName"
}

@JsonClass(generateAdapter = true)
data class TaskStatusHistoryDto(
    val id: String,
    val fromStatus: String?,
    val toStatus: String,
    val changedBy: TaskUserDto,
    val reason: String?,
    val createdAt: String,
)

@JsonClass(generateAdapter = true)
data class CreateTaskRequest(
    val recipeId: String,
    val targetQuantity: Double,
    val targetUnit: String,
    val priority: Int? = null,
    val dueDate: String? = null,
    val notes: String? = null,
    val assignedToId: String? = null,
    /** Custom name; null = recipe name. */
    val title: String? = null,
    val visibility: String? = null,
    val visibleToIds: List<String>? = null,
)

@JsonClass(generateAdapter = true)
data class UpdateTaskRequest(
    val recipeId: String? = null,
    val targetQuantity: Double? = null,
    val targetUnit: String? = null,
    val priority: Int? = null,
    val dueDate: String? = null,
    val notes: String? = null,
    val assignedToId: String? = null,
    /** "" clears the custom name (server stores null = recipe name). */
    val title: String? = null,
    val visibility: String? = null,
    val visibleToIds: List<String>? = null,
)

@JsonClass(generateAdapter = true)
data class TransitionTaskRequest(
    val status: String,
    val reason: String? = null,
    val actualYield: Double? = null,
)
