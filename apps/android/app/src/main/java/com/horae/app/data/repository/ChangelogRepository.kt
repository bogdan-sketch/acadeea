package com.horae.app.data.repository

import com.horae.app.data.remote.api.ChangelogApi
import com.horae.app.data.remote.dto.ChangelogResponseDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChangelogRepository @Inject constructor(
    private val changelogApi: ChangelogApi,
) {
    suspend fun getChangelog(): ChangelogResponseDto = changelogApi.getChangelog()
}
