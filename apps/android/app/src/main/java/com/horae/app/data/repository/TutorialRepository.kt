package com.horae.app.data.repository

import com.horae.app.data.remote.api.TutorialApi
import com.horae.app.data.remote.dto.TutorialContentResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TutorialRepository @Inject constructor(
    private val tutorialApi: TutorialApi,
) {
    suspend fun getContent(): TutorialContentResponse = tutorialApi.getContent()
}
