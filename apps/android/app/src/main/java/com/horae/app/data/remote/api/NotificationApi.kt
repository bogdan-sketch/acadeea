package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.NotificationResponse
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.UnreadCountResponse
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.QueryMap

interface NotificationApi {

    @GET("api/v1/notifications")
    suspend fun getNotifications(@QueryMap query: Map<String, String>): PaginatedResponse<NotificationResponse>

    @GET("api/v1/notifications/unread-count")
    suspend fun getUnreadCount(): UnreadCountResponse

    @PATCH("api/v1/notifications/read-all")
    suspend fun markAllRead()

    @PATCH("api/v1/notifications/{id}/read")
    suspend fun markRead(@Path("id") id: String)
}
