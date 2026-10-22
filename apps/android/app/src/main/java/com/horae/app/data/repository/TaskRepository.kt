package com.horae.app.data.repository

import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.api.TaskApi
import com.horae.app.data.remote.dto.CreateTaskRequest
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.TaskResponse
import com.horae.app.data.remote.dto.TransitionTaskRequest
import com.horae.app.data.remote.dto.UpdateTaskRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TaskRepository @Inject constructor(
    private val api: TaskApi,
) {

    suspend fun getTasks(
        page: Int = 1,
        limit: Int = 20,
        status: String? = null,
        assignedToId: String? = null,
        search: String? = null,
        myDay: Boolean = false,
        /** "due" (deadline first) or "completed" (latest closed first). */
        sort: String? = null,
    ): PaginatedResponse<TaskResponse> {
        val query = mutableMapOf(
            "page" to page.toString(),
            "limit" to limit.toString(),
        )
        status?.let { query["status"] = it }
        assignedToId?.let { query["assignedToId"] = it }
        search?.takeIf { it.isNotBlank() }?.let { query["search"] = it }
        if (myDay) query["myDay"] = "true"
        sort?.let { query["sort"] = it }
        return api.getTasks(query)
    }

    suspend fun getTask(id: String): TaskResponse =
        api.getTask(id)

    suspend fun createTask(body: CreateTaskRequest): TaskResponse =
        api.createTask(body)

    suspend fun updateTask(id: String, body: UpdateTaskRequest): TaskResponse =
        api.updateTask(id, body)

    suspend fun transitionTask(id: String, body: TransitionTaskRequest): TaskResponse =
        api.transitionTask(id, body)

    suspend fun deleteTask(id: String) =
        api.deleteTask(id)

    /** Deletes every id independently; see `BulkDeleteResultDto.failed` for the ones that could not go. */
    /** Preview step before [bulkDelete]: dependents the delete would touch. */
    suspend fun bulkDeletePreview(ids: List<String>): BulkDeletePreviewDto =
        api.bulkDeletePreview(BulkDeletePreviewRequest(ids))

    suspend fun bulkDelete(ids: List<String>): BulkDeleteResultDto =
        api.bulkDelete(BulkDeleteRequest(ids = ids, cascade = true))

    /** Apply one action to every id (per-row failures in `failed`). */
    suspend fun bulkAction(ids: List<String>, action: String, params: Map<String, Any?>? = null): BulkActionResultDto =
        api.bulkAction(BulkActionRequest(ids = ids, action = action, params = params))
}
