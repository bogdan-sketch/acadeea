package com.horae.app.data.repository

import com.horae.app.data.remote.api.UserApi
import com.horae.app.data.remote.dto.ChangeRoleRequest
import com.horae.app.data.remote.dto.InvitationResponse
import com.horae.app.data.remote.dto.InviteUserRequest
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.UpdateUserNameRequest
import com.horae.app.data.remote.dto.UserResponse
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UserRepository @Inject constructor(
    private val api: UserApi,
) {

    suspend fun getUsers(
        page: Int = 1,
        limit: Int = 20,
        isActive: Boolean? = true,
        role: String? = null,
        search: String? = null,
    ): PaginatedResponse<UserResponse> {
        val query = mutableMapOf(
            "page" to page.toString(),
            "limit" to limit.toString(),
        )
        isActive?.let { query["isActive"] = it.toString() }
        role?.let { query["role"] = it }
        search?.takeIf { it.isNotBlank() }?.let { query["search"] = it }
        return api.getUsers(query)
    }

    suspend fun getUser(id: String): UserResponse =
        api.getUser(id)

    suspend fun inviteUser(email: String, role: String) =
        api.inviteUser(InviteUserRequest(email = email, role = role))

    suspend fun changeRole(id: String, role: String): UserResponse =
        api.changeRole(id, ChangeRoleRequest(role = role))

    suspend fun deactivateUser(id: String): UserResponse =
        api.deactivateUser(id)

    suspend fun reactivateUser(id: String): UserResponse =
        api.reactivateUser(id)

    suspend fun getInvitations(): List<InvitationResponse> =
        api.getInvitations()

    /** Own first/last name (PATCH /users/:id, needs `update User`). */
    suspend fun updateName(id: String, firstName: String, lastName: String) {
        api.updateName(id, UpdateUserNameRequest(firstName, lastName)).close()
    }

    /** My profile photo — any image; the server crops and compresses it. */
    suspend fun uploadMyAvatar(bytes: ByteArray, mime: String) {
        val ext = mime.substringAfter('/', "jpg").substringBefore('+')
        val part = MultipartBody.Part.createFormData(
            "avatar",
            "avatar.$ext",
            bytes.toRequestBody(mime.toMediaTypeOrNull()),
        )
        api.uploadMyAvatar(part).close()
    }

    suspend fun deleteMyAvatar() {
        api.deleteMyAvatar().close()
    }
}
