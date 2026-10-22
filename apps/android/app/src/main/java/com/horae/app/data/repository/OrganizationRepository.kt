package com.horae.app.data.repository

import com.horae.app.data.local.BrandingManager
import com.horae.app.data.remote.api.OrganizationApi
import com.horae.app.data.remote.dto.CreateSnapshotRequest
import com.horae.app.data.remote.dto.OrgSnapshotDto
import com.horae.app.data.remote.dto.OrganizationBranding
import com.horae.app.data.remote.dto.UpdateCompanyRequest
import com.horae.app.data.remote.dto.UpdateDefaultLocationRequest
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import com.horae.app.data.remote.dto.UpdateOrganizationRequest
import com.horae.app.data.remote.dto.UpdateWooDeliveryRequest
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrganizationRepository @Inject constructor(
    private val organizationApi: OrganizationApi,
    private val brandingManager: BrandingManager,
) {

    /** Admin: the location every operation starts on (null clears it). Updates BrandingManager too. */
    suspend fun setDefaultLocation(locationId: String?) {
        Timber.d("OrganizationRepository: setDefaultLocation $locationId")
        val branding = organizationApi.updateDefaultLocation(UpdateDefaultLocationRequest(locationId))
        brandingManager.apply(branding)
    }

    suspend fun loadBranding() {
        Timber.d("OrganizationRepository: loadBranding")
        val branding = organizationApi.get()
        brandingManager.apply(branding)
    }

    /**
     * [secondaryColor]/[tertiaryColor]: hex to set, or null to reset to the client default palette.
     * [brandingTokens] is the FULL multi-platform token object (caller merges its android block
     * into the stored value — read-modify-write; other platforms must be preserved). It is always
     * serialized, and an explicit null CLEARS every platform's overrides server-side, so it has no
     * default — callers must pass the merged value deliberately.
     * [fontFamily]: predefined key ("inter"/"manrope"/"lora"/"poppins"/"system").
     */
    suspend fun updateBranding(
        name: String?,
        accentColor: String?,
        secondaryColor: String?,
        tertiaryColor: String?,
        brandingTokens: Map<String, Any?>?,
        fontFamily: String? = null,
    ) {
        Timber.d(
            "OrganizationRepository: updateBranding name=$name accent=$accentColor " +
                "secondary=$secondaryColor tertiary=$tertiaryColor font=$fontFamily " +
                "tokens=${brandingTokens?.keys}"
        )
        val branding = organizationApi.update(
            UpdateOrganizationRequest(
                name = name,
                accentColor = accentColor,
                secondaryColor = secondaryColor,
                tertiaryColor = tertiaryColor,
                brandingTokens = brandingTokens,
                fontFamily = fontFamily,
            )
        )
        brandingManager.apply(branding)
    }

    /** GET /organization with the company fields; refreshes the cached branding too. */
    suspend fun loadOrganization(): OrganizationBranding {
        val org = organizationApi.get()
        brandingManager.apply(org)
        return org
    }

    /** Admin: the "Livrări din magazinul online" switch. Updates BrandingManager too. */
    suspend fun setWooDeliveryEnabled(enabled: Boolean): OrganizationBranding {
        val org = organizationApi.updateWooDelivery(UpdateWooDeliveryRequest(enabled))
        brandingManager.apply(org)
        return org
    }

    suspend fun updateCompany(body: UpdateCompanyRequest): OrganizationBranding {
        val org = organizationApi.updateCompany(body)
        brandingManager.apply(org)
        return org
    }

    /** [variant] "login-light" (logo on light schemes) or "login-dark" (on dark schemes). */
    suspend fun uploadLogo(bytes: ByteArray, mime: String, variant: String): OrganizationBranding {
        val ext = mime.substringAfter('/', "png").substringBefore('+')
        val part = MultipartBody.Part.createFormData(
            "logo",
            "logo.$ext",
            bytes.toRequestBody(mime.toMediaTypeOrNull()),
        )
        val org = organizationApi.uploadLogo(part, variant.toRequestBody("text/plain".toMediaTypeOrNull()))
        brandingManager.apply(org)
        return org
    }

    suspend fun clearLogo(variant: String): OrganizationBranding {
        val org = organizationApi.clearLogo(variant)
        brandingManager.apply(org)
        return org
    }

    /** Categories grouped under their super-category, both in display order. */
    suspend fun categoryGroups(): List<Pair<String, List<String>>> {
        val supers = organizationApi.getSuperCategories()
        val byKind = organizationApi.getCategoryCarousel()
            .filter { it.parentName == null }
            .groupBy({ it.kind }, { it.name })
        return supers.map { it.name to byKind[it.kind].orEmpty() }
    }

    suspend fun snapshots(): List<OrgSnapshotDto> = organizationApi.getSnapshots()

    suspend fun createSnapshot(): OrgSnapshotDto = organizationApi.createSnapshot(CreateSnapshotRequest())
}
