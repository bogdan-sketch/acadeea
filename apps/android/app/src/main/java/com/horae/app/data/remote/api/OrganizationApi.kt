package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.OrgCategoryDto
import com.horae.app.data.remote.dto.CreateSnapshotRequest
import com.horae.app.data.remote.dto.OrgSuperCategoryDto
import com.horae.app.data.remote.dto.OrgSnapshotDto
import com.horae.app.data.remote.dto.OrganizationBranding
import com.horae.app.data.remote.dto.UpdateCompanyRequest
import com.horae.app.data.remote.dto.UpdateDefaultLocationRequest
import com.horae.app.data.remote.dto.UpdateOrganizationRequest
import com.horae.app.data.remote.dto.UpdateWooDeliveryRequest
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

interface OrganizationApi {

    @GET("api/v1/organization")
    suspend fun get(): OrganizationBranding

    /** Public branding (name, logos) — works logged out. */
    @GET("api/v1/organization/by-slug/{slug}")
    suspend fun getBySlug(@Path("slug") slug: String): OrganizationBranding

    @PATCH("api/v1/organization")
    suspend fun update(@Body body: UpdateOrganizationRequest): OrganizationBranding

    @PATCH("api/v1/organization")
    suspend fun updateDefaultLocation(@Body body: UpdateDefaultLocationRequest): OrganizationBranding

    /** "Livrări din magazinul online" switch (Profil › Setări › Comenzi din site). */
    @PATCH("api/v1/organization")
    suspend fun updateWooDelivery(@Body body: UpdateWooDeliveryRequest): OrganizationBranding

    /** Companie form (Profil › Setări). */
    @PATCH("api/v1/organization")
    suspend fun updateCompany(@Body body: UpdateCompanyRequest): OrganizationBranding

    /** Logo upload, multipart field `logo`; [variant] "login-light" | "login-dark". */
    @Multipart
    @POST("api/v1/organization/logo")
    suspend fun uploadLogo(
        @Part logo: MultipartBody.Part,
        @Part("variant") variant: RequestBody,
    ): OrganizationBranding

    @DELETE("api/v1/organization/logo")
    suspend fun clearLogo(@Query("variant") variant: String): OrganizationBranding

    /** Super-categories in display order (Materii prime, Semipreparate, …) — Categorii summary. */
    @GET("api/v1/recipes/super-categories")
    suspend fun getSuperCategories(): List<OrgSuperCategoryDto>

    /** Every category with its super-category kind. */
    @GET("api/v1/recipes/categories/carousel")
    suspend fun getCategoryCarousel(): List<OrgCategoryDto>

    // Backup & restaurare (root only)
    @GET("api/v1/backups/snapshots")
    suspend fun getSnapshots(): List<OrgSnapshotDto>

    @POST("api/v1/backups/snapshots")
    suspend fun createSnapshot(@Body body: CreateSnapshotRequest): OrgSnapshotDto
}
