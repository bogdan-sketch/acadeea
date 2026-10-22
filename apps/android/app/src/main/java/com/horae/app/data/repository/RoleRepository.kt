package com.horae.app.data.repository

import com.horae.app.data.remote.api.RoleApi
import com.horae.app.data.remote.dto.CreateRoleRequest
import com.horae.app.data.remote.dto.PermissionRule
import com.horae.app.data.remote.dto.RoleResponse
import com.horae.app.data.remote.dto.SetPermissionsRequest
import com.horae.app.data.remote.dto.SubjectsResponse
import com.horae.app.data.remote.dto.UpdateRoleRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RoleRepository @Inject constructor(
    private val api: RoleApi,
) {

    suspend fun getRoles(): List<RoleResponse> =
        api.getRoles()

    suspend fun getRole(id: String): RoleResponse =
        api.getRole(id)

    suspend fun getSubjects(): SubjectsResponse =
        api.getSubjects()

    suspend fun createRole(name: String, description: String?): RoleResponse =
        api.createRole(CreateRoleRequest(name = name, description = description))

    suspend fun updateRole(id: String, name: String?, description: String?): RoleResponse =
        api.updateRole(id, UpdateRoleRequest(name = name, description = description))

    suspend fun deleteRole(id: String) =
        api.deleteRole(id)

    suspend fun setPermissions(roleId: String, permissions: List<PermissionRule>): RoleResponse =
        api.setPermissions(roleId, SetPermissionsRequest(permissions = permissions))
}
