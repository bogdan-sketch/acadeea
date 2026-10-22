package com.horae.app.data.remote.interceptor

import com.horae.app.data.local.SessionEvents
import com.horae.app.data.local.TokenManager
import com.horae.app.data.remote.dto.RefreshTokenRequest
import com.horae.app.data.remote.dto.TokenResponse
import com.squareup.moshi.Moshi
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The access token expired and could not be refreshed RIGHT NOW (refresh throttled 429,
 * server 5xx, offline, timeout). The session is still valid: tokens are kept and the
 * caller should offer "Încearcă din nou". `ApiErrors.userMessage` maps it to Romanian.
 */
class SessionRefreshUnavailableException(val httpCode: Int?, cause: Throwable? = null) :
    IOException("Session refresh unavailable (${httpCode ?: "network"})", cause)

/**
 * OkHttp interceptor that:
 * 1. attaches the Bearer access token to every request;
 * 2. on 401, refreshes once via POST /api/v1/auth/refresh (one refresh at a time) and retries;
 * 3. ends the session ONLY when the refresh itself answers 401/403 (or there is no refresh
 *    token): clears the tokens and emits [SessionEvents.ended] so the UI returns to login;
 * 4. on 429 / 5xx / IOException from the refresh, KEEPS the tokens and throws
 *    [SessionRefreshUnavailableException] (a retryable error) instead of logging out.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager,
    private val moshi: Moshi,
    private val sessionEvents: SessionEvents,
) : Interceptor {

    private val lock = Any()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private sealed interface RefreshResult {
        data class Success(val tokens: TokenResponse) : RefreshResult
        /** The server refused the refresh token (401/403): the session is over. */
        data class Rejected(val code: Int) : RefreshResult
        /** Temporary failure: keep the session. */
        data class Unavailable(val code: Int?, val cause: Throwable?) : RefreshResult
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Skip auth header for login and refresh endpoints
        if (originalRequest.isAuthEndpoint()) {
            return chain.proceed(originalRequest)
        }

        val accessToken = tokenManager.accessToken
        val response = chain.proceed(originalRequest.withBearerToken(accessToken))

        if (response.code != 401 || accessToken.isNullOrBlank()) {
            return response
        }

        Timber.d("AuthInterceptor: 401 received, attempting token refresh")

        // OkHttp refuses a second chain.proceed() while the 401 is still open ("cannot make a
        // new request because the previous response is still open"), which made EVERY refresh
        // fail as "unavailable". Keep a buffered copy to hand back, close the original.
        val unauthorized = response.newBuilder().body(response.peekBody(MAX_ERROR_BODY_BYTES)).build()
        response.close()

        synchronized(lock) {
            // Another thread may have refreshed while we waited.
            val currentToken = tokenManager.accessToken
            if (currentToken != null && currentToken != accessToken) {
                return chain.proceed(originalRequest.withBearerToken(currentToken))
            }

            val refreshToken = tokenManager.refreshToken
            if (refreshToken.isNullOrBlank()) {
                Timber.w("AuthInterceptor: no refresh token, ending session")
                endSession()
                return unauthorized
            }

            when (val result = performTokenRefresh(chain, refreshToken)) {
                is RefreshResult.Success -> {
                    Timber.d("AuthInterceptor: token refresh successful")
                    tokenManager.saveTokens(result.tokens.accessToken, result.tokens.refreshToken)
                    return chain.proceed(originalRequest.withBearerToken(result.tokens.accessToken))
                }
                is RefreshResult.Rejected -> {
                    Timber.w("AuthInterceptor: refresh rejected (${result.code}), ending session")
                    endSession()
                    return unauthorized
                }
                is RefreshResult.Unavailable -> {
                    Timber.w(result.cause, "AuthInterceptor: refresh unavailable (${result.code}), keeping session")
                    throw SessionRefreshUnavailableException(result.code, result.cause)
                }
            }
        }
    }

    private companion object {
        /** Error bodies are tiny JSON; this only bounds the buffered copy of the 401. */
        const val MAX_ERROR_BODY_BYTES = 1L shl 20
    }

    private fun endSession() {
        tokenManager.clearTokens()
        sessionEvents.notifyEnded()
    }

    private fun performTokenRefresh(chain: Interceptor.Chain, refreshToken: String): RefreshResult {
        return try {
            val json = moshi.adapter(RefreshTokenRequest::class.java)
                .toJson(RefreshTokenRequest(refreshToken = refreshToken))
            val url = chain.request().url
            val refreshUrl = url.newBuilder().encodedPath("/api/v1/auth/refresh").query(null).build()
            val refreshRequest = Request.Builder()
                .url(refreshUrl)
                .post(json.toRequestBody(jsonMediaType))
                .header("Content-Type", "application/json")
                .build()

            chain.proceed(refreshRequest).use { refreshResponse ->
                val code = refreshResponse.code
                when {
                    refreshResponse.isSuccessful -> {
                        val body = refreshResponse.body?.string()
                        val tokens = body?.let { moshi.adapter(TokenResponse::class.java).fromJson(it) }
                        if (tokens != null) RefreshResult.Success(tokens)
                        else RefreshResult.Unavailable(code, null)
                    }
                    code == 401 || code == 403 -> RefreshResult.Rejected(code)
                    else -> RefreshResult.Unavailable(code, null) // 429, 5xx, anything else: retry later
                }
            }
        } catch (e: IOException) {
            RefreshResult.Unavailable(null, e)
        } catch (e: Exception) {
            Timber.e(e, "AuthInterceptor: refresh request failed")
            RefreshResult.Unavailable(null, e)
        }
    }

    private fun Request.isAuthEndpoint(): Boolean {
        val path = url.encodedPath
        return path.endsWith("/auth/login") || path.endsWith("/auth/refresh")
    }

    private fun Request.withBearerToken(token: String?): Request {
        if (token.isNullOrBlank()) return this
        return newBuilder()
            .header("Authorization", "Bearer $token")
            .build()
    }
}
