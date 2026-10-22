package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.AuthResponse
import com.horae.app.data.remote.dto.AuthUser
import com.horae.app.data.remote.dto.DeleteAccountRequest
import com.horae.app.data.remote.dto.ForgotPasswordRequest
import com.horae.app.data.remote.dto.LoginRequest
import com.horae.app.data.remote.dto.RefreshTokenRequest
import com.horae.app.data.remote.dto.TokenResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST

interface AuthApi {

    @POST("api/v1/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("api/v1/auth/refresh")
    suspend fun refresh(@Body body: RefreshTokenRequest): TokenResponse

    @POST("api/v1/auth/logout")
    suspend fun logout(@Body body: RefreshTokenRequest)

    @GET("api/v1/auth/me")
    suspend fun me(): AuthUser

    /** Public — always 204; emails a reset link only if the account exists and is active. */
    @POST("api/v1/auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest)

    /**
     * Self-service account deletion — confirms the current password, then the
     * server anonymizes PII, revokes sessions and returns 200 `{deleted:true}`.
     * DELETE with a body, so it uses @HTTP(hasBody=true).
     */
    @HTTP(method = "DELETE", path = "api/v1/auth/account", hasBody = true)
    suspend fun deleteAccount(@Body body: DeleteAccountRequest)
}
