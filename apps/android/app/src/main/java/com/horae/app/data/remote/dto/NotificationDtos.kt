package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

/**
 * A single in-app notification. Mirrors the API shape
 * `{ id, type, title, body, data?, readAt?, createdAt }`. The arbitrary `data`
 * deep-link payload isn't decoded — the inbox only renders + marks read.
 */
@JsonClass(generateAdapter = true)
data class NotificationResponse(
    val id: String,
    val type: String = "GENERIC",
    val title: String = "",
    val body: String = "",
    val readAt: String? = null,
    val createdAt: String,
) {
    val isRead: Boolean get() = readAt != null
}

/** `GET /notifications/unread-count` → `{ count }`. */
@JsonClass(generateAdapter = true)
data class UnreadCountResponse(
    val count: Int,
)
