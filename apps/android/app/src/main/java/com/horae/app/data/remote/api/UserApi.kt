package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.ChangeRoleRequest
import com.horae.app.data.remote.dto.InvitationResponse
import com.horae.app.data.remote.dto.InviteUserRequest
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.UserResponse
import com.horae.app.data.remote.dto.UpdateUserNameRequest
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.Multipart
import retrofit2.http.Part
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.QueryMap

interface UserApi {

    @GET("api/v1/users")
    suspend fun getUsers(@QueryMap query: Map<String, String>): PaginatedResponse<UserResponse>

    @GET("api/v1/users/{id}")
    suspend fun getUser(@Path("id") id: String): UserResponse

    @POST("api/v1/users/invite")
    suspend fun inviteUser(@Body body: InviteUserRequest)

    @PATCH("api/v1/users/{id}/role")
    suspend fun changeRole(@Path("id") id: String, @Body body: ChangeRoleRequest): UserResponse

    @DELETE("api/v1/users/{id}")
    suspend fun deactivateUser(@Path("id") id: String): UserResponse

    @PATCH("api/v1/users/{id}/reactivate")
    suspend fun reactivateUser(@Path("id") id: String): UserResponse

    @GET("api/v1/users/invitations")
    suspend fun getInvitations(): List<InvitationResponse>

    /** Own name (needs `update User`; there is no "update me" endpoint, same as web/iOS). */
    @PATCH("api/v1/users/{id}")
    suspend fun updateName(@Path("id") id: String, @Body body: UpdateUserNameRequest): ResponseBody

    /** My profile photo, multipart field `avatar`. */
    @Multipart
    @POST("api/v1/users/me/avatar")
    suspend fun uploadMyAvatar(@Part avatar: MultipartBody.Part): ResponseBody

    @DELETE("api/v1/users/me/avatar")
    suspend fun deleteMyAvatar(): ResponseBody
}
