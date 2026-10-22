package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.ChangelogResponseDto
import retrofit2.http.GET

interface ChangelogApi {

    @GET("api/v1/changelog")
    suspend fun getChangelog(): ChangelogResponseDto
}
