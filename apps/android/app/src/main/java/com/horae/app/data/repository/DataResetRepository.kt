package com.horae.app.data.repository

import com.horae.app.data.remote.api.DataResetApi
import com.horae.app.data.remote.dto.DataResetResultDto
import com.horae.app.data.remote.dto.ResetCategoryPreviewDto
import com.horae.app.data.remote.dto.RunDataResetRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DataResetRepository @Inject constructor(
    private val api: DataResetApi,
) {
    companion object {
        const val CONFIRM_WORD = "RESETEAZA"
    }

    suspend fun preview(): List<ResetCategoryPreviewDto> = api.preview().categories

    /** Deletes the chosen categories (+ their dependencies, resolved server-side). */
    suspend fun run(categories: List<String>): DataResetResultDto =
        api.run(RunDataResetRequest(categories = categories, confirm = CONFIRM_WORD))
}
