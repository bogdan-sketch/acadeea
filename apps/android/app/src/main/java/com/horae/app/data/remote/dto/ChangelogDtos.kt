package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

/** GET /api/v1/changelog — public curated changelog (Romanian, newest first). */
@JsonClass(generateAdapter = true)
data class ChangelogResponseDto(
    val currentVersion: String,
    val entries: List<ChangelogEntryDto>,
)

@JsonClass(generateAdapter = true)
data class ChangelogEntryDto(
    val version: String,
    val date: String,
    val title: String,
    val highlights: List<String> = emptyList(),
    val nou: List<ChangelogItemDto> = emptyList(),
    val imbunatatiri: List<ChangelogItemDto> = emptyList(),
    val reparat: List<ChangelogItemDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class ChangelogItemDto(
    val text: String,
    val platforms: List<String> = emptyList(),
)
