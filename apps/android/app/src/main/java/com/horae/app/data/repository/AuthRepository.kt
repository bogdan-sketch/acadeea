package com.horae.app.data.repository

import com.horae.app.data.local.BrandingManager
import com.horae.app.data.local.TokenManager
import com.horae.app.data.remote.api.AuthApi
import com.horae.app.data.remote.dto.AuthUser
import com.horae.app.data.remote.dto.DeleteAccountRequest
import com.horae.app.data.remote.dto.ForgotPasswordRequest
import com.horae.app.data.remote.dto.LoginRequest
import com.horae.app.data.remote.dto.RefreshTokenRequest
import com.horae.app.domain.model.User
import com.horae.app.domain.model.UserRole
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val authApi: AuthApi,
    private val tokenManager: TokenManager,
    private val brandingManager: BrandingManager,
) {

    /**
     * Log in with email/password. Stores tokens and returns the authenticated [User].
     */
    suspend fun login(email: String, password: String): User {
        Timber.d("AuthRepository: login email=$email")
        val response = authApi.login(LoginRequest(email = email, password = password))

        tokenManager.saveTokens(response.accessToken, response.refreshToken)

        // Tenant branding rides along in the login response — apply immediately.
        response.organization?.let { brandingManager.apply(it) }

        Timber.d("AuthRepository: login success, user=${response.user.email} role=${response.user.role?.slug}")

        return response.user.toUser().also { tokenManager.cachedUser = it }
    }

    /**
     * Fetch current user from /auth/me. Used to restore session on app launch.
     */
    suspend fun fetchCurrentUser(): User {
        Timber.d("AuthRepository: fetchCurrentUser")
        val authUser = authApi.me()

        // /auth/me includes tenant branding — apply so relaunch themes without an extra call.
        authUser.organization?.let { brandingManager.apply(it) }

        return authUser.toUser().also { tokenManager.cachedUser = it }
    }

    /**
     * The last user seen online — used when a cold start is offline (or the API is
     * throttled / down) so the app opens with the saved session instead of the login form.
     */
    val cachedUser: User? get() = tokenManager.cachedUser

    private fun AuthUser.toUser() = User(
        id = id,
        email = email,
        firstName = firstName,
        lastName = lastName,
        role = UserRole.fromString(role?.slug ?: ""),
        roleSlug = role?.slug,
        roleName = role?.name,
        avatarUrl = avatarUrl,
    )

    /**
     * Log out. Sends refresh token to backend and clears local tokens.
     */
    suspend fun logout() {
        Timber.d("AuthRepository: logout")
        try {
            val refreshToken = tokenManager.refreshToken
            if (refreshToken != null) {
                authApi.logout(RefreshTokenRequest(refreshToken = refreshToken))
            }
        } catch (e: Exception) {
            Timber.w(e, "AuthRepository: logout API call failed (non-fatal)")
        } finally {
            tokenManager.clearTokens()
            // Tenant branding deliberately SURVIVES logout — the device stays on
            // the last org's brand until a different org signs in.
        }
    }

    /**
     * Request a password-reset email. The backend always responds 204 (it only sends a link when
     * the account exists + is active); the emailed link opens the web /reset-password page.
     */
    suspend fun requestPasswordReset(email: String) {
        Timber.d("AuthRepository: requestPasswordReset email=$email")
        authApi.forgotPassword(ForgotPasswordRequest(email = email))
    }

    /**
     * Delete the current user's own account after confirming their password.
     * On success the server has anonymized the account and revoked all sessions;
     * we clear the local tokens so the app returns to the login screen. Throws on
     * failure (e.g. 400 INVALID_PASSWORD / LAST_ACTIVE_ADMIN) — session left intact.
     */
    suspend fun deleteAccount(password: String) {
        Timber.d("AuthRepository: deleteAccount")
        authApi.deleteAccount(DeleteAccountRequest(password = password))
        tokenManager.clearTokens()
        // Tenant branding deliberately SURVIVES (same policy as logout).
    }

    /**
     * Whether we have stored tokens (i.e. potentially restorable session).
     */
    val hasTokens: Boolean get() = tokenManager.hasTokens
}
