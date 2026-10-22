package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

/** GET /api/v1/tutorial/content — public, curated Romanian walkthrough content. */
@JsonClass(generateAdapter = true)
data class TutorialContentResponse(
    val flows: List<TutorialFlowDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class TutorialFlowDto(
    /** Stable flow key, e.g. "recipes.create". */
    val id: String,
    val title: String,
    /** Help-center grouping, e.g. "Rețete". */
    val category: String,
    /** Platforms this flow's feature exists on: "web" | "ios" | "android". */
    val platforms: List<String> = emptyList(),
    val steps: List<TutorialStepDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class TutorialStepDto(
    /** Stable anchor key clients map to a real UI element, e.g. "recipes.create.save". */
    val id: String,
    val title: String,
    val body: String,
)
