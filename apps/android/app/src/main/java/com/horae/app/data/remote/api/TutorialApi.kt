package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.TutorialContentResponse
import retrofit2.http.GET

interface TutorialApi {

    /** Public endpoint (no auth required, but a token is harmless). */
    @GET("api/v1/tutorial/content")
    suspend fun getContent(): TutorialContentResponse
}
