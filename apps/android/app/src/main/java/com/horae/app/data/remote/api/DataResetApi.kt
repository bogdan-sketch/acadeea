package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.DataResetPreviewResponse
import com.horae.app.data.remote.dto.DataResetResultDto
import com.horae.app.data.remote.dto.RunDataResetRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Resetare date — `/api/v1/data-reset`. Both routes need `manage all` (admin)
 * and are scoped to the JWT's organization; the server snapshots the org first.
 */
interface DataResetApi {

    @GET("api/v1/data-reset/preview")
    suspend fun preview(): DataResetPreviewResponse

    @POST("api/v1/data-reset")
    suspend fun run(@Body body: RunDataResetRequest): DataResetResultDto
}
