package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.CreateRoleRequest
import com.horae.app.data.remote.dto.RoleResponse
import com.horae.app.data.remote.dto.SetPermissionsRequest
import com.horae.app.data.remote.dto.SubjectsResponse
import com.horae.app.data.remote.dto.UpdateRoleRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/** Role management endpoints (admin only). Mirrors iOS RoleService / web rolesApi. */
interface RoleApi {

    @GET("api/v1/roles")
    suspend fun getRoles(): List<RoleResponse>

    @GET("api/v1/roles/subjects")
    suspend fun getSubjects(): SubjectsResponse

    @GET("api/v1/roles/{id}")
    suspend fun getRole(@Path("id") id: String): RoleResponse

    @POST("api/v1/roles")
    suspend fun createRole(@Body body: CreateRoleRequest): RoleResponse

    @PATCH("api/v1/roles/{id}")
    suspend fun updateRole(@Path("id") id: String, @Body body: UpdateRoleRequest): RoleResponse

    @DELETE("api/v1/roles/{id}")
    suspend fun deleteRole(@Path("id") id: String)

    @PUT("api/v1/roles/{id}/permissions")
    suspend fun setPermissions(
        @Path("id") id: String,
        @Body body: SetPermissionsRequest,
    ): RoleResponse
}
