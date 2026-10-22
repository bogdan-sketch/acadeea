package com.horae.app.data.repository

import com.horae.app.data.remote.api.LocationApi
import com.horae.app.data.remote.dto.LocationResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LocationRepository @Inject constructor(
    private val api: LocationApi,
) {

    suspend fun getLocations(): List<LocationResponse> = api.getLocations()

    /** Locations the signed-in user works at (may be empty → fall back to [getLocations]). */
    suspend fun getMyLocations(): List<LocationResponse> = api.getMyLocations()
}
