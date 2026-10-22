package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.dto.CreateTaskRequest
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.TaskResponse
import com.horae.app.data.remote.dto.TransitionTaskRequest
import com.horae.app.data.remote.dto.UpdateTaskRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.QueryMap

interface TaskApi {

    @GET("api/v1/tasks")
    suspend fun getTasks(@QueryMap query: Map<String, String>): PaginatedResponse<TaskResponse>

    @GET("api/v1/tasks/{id}")
    suspend fun getTask(@Path("id") id: String): TaskResponse

    @POST("api/v1/tasks")
    suspend fun createTask(@Body body: CreateTaskRequest): TaskResponse

    @PATCH("api/v1/tasks/{id}")
    suspend fun updateTask(@Path("id") id: String, @Body body: UpdateTaskRequest): TaskResponse

    @POST("api/v1/tasks/{id}/transition")
    suspend fun transitionTask(@Path("id") id: String, @Body body: TransitionTaskRequest): TaskResponse

    /** Bulk delete — per-row failures reported in `failed`, batch never aborts. */
    /** What else a bulk delete of these ids would touch (dependents summed over the selection). */
    @POST("api/v1/tasks/bulk-delete/preview")
    suspend fun bulkDeletePreview(@Body body: BulkDeletePreviewRequest): BulkDeletePreviewDto

    @POST("api/v1/tasks/bulk-delete")
    suspend fun bulkDelete(@Body body: BulkDeleteRequest): BulkDeleteResultDto

    /** Bulk action (status / assign / category / …) — per-row isolation, see `BulkActionCatalog`. */
    @POST("api/v1/tasks/bulk-action")
    suspend fun bulkAction(@Body body: BulkActionRequest): BulkActionResultDto

    @DELETE("api/v1/tasks/{id}")
    suspend fun deleteTask(@Path("id") id: String)

    @GET("api/v1/tasks/calendar")
    suspend fun getCalendar(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): Map<String, List<TaskResponse>>
}
