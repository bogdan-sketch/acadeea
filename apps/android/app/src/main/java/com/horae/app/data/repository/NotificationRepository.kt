package com.horae.app.data.repository

import com.horae.app.data.remote.api.NotificationApi
import com.horae.app.data.remote.dto.NotificationResponse
import com.horae.app.data.remote.dto.PaginatedResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepository @Inject constructor(
    private val api: NotificationApi,
) {

    suspend fun getNotifications(page: Int = 1, limit: Int = 20): PaginatedResponse<NotificationResponse> =
        api.getNotifications(
            mapOf("page" to page.toString(), "limit" to limit.toString()),
        )

    suspend fun getUnreadCount(): Int = api.getUnreadCount().count

    suspend fun markAllRead() = api.markAllRead()

    suspend fun markRead(id: String) = api.markRead(id)
}
