package com.horae.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.horae.app.data.local.BrandingManager
import com.horae.app.data.local.SessionEndReason
import com.horae.app.data.local.SessionEvents
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.repository.AuthRepository
import com.horae.app.data.repository.OrganizationRepository
import com.horae.app.domain.model.User
import com.horae.app.domain.model.UserRole
import com.horae.app.observability.Analytics
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val isRestoringSession: Boolean = true,
    val isAuthenticated: Boolean = false,
    val user: User? = null,
    /**
     * Signed in from the saved session while the API was unreachable (offline cold start,
     * 429/5xx). The app is usable; the user is re-validated in the background.
     */
    val isOfflineSession: Boolean = false,
    val errorMessage: String? = null,
    /** Forgot-password dialog ("Ai uitat parola?") state. */
    val showForgotDialog: Boolean = false,
    val forgotEmail: String = "",
    val forgotSubmitting: Boolean = false,
    /** Confirmation shown after a reset request (null while none). */
    val forgotMessage: String? = null,
) {
    val isFormValid: Boolean
        get() = email.isNotBlank() && password.isNotBlank()
}

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val organizationRepository: OrganizationRepository,
    /** Org name + logos for the login screen. */
    val brandingManager: BrandingManager,
    private val sessionEvents: SessionEvents,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    /**
     * Emits when the server ends the session (refresh rejected with 401/403). This ViewModel
     * already reacts (isAuthenticated → false, so AppNavHost shows the login form); other UI
     * can collect it too.
     */
    val sessionEnded: SharedFlow<SessionEndReason> = sessionEvents.ended

    private var revalidateJob: Job? = null

    init {
        viewModelScope.launch {
            sessionEvents.ended.collect { onSessionEnded() }
        }
    }

    private fun onSessionEnded() {
        revalidateJob?.cancel()
        val wasSignedIn = _uiState.value.isAuthenticated
        Timber.w("LoginViewModel: session ended by the server (wasSignedIn=$wasSignedIn)")
        if (wasSignedIn) Analytics.reset()
        _uiState.update {
            LoginUiState(
                email = it.user?.email ?: it.email,
                isRestoringSession = false,
                errorMessage = if (wasSignedIn) "Sesiunea a expirat. Autentifică-te din nou." else null,
            )
        }
    }

    /** Fire-and-forget: fetch org branding (name/logo/accent) into BrandingManager. */
    private fun loadBranding() {
        viewModelScope.launch {
            try {
                organizationRepository.loadBranding()
            } catch (e: Exception) {
                Timber.w(e, "LoginViewModel: branding load failed (non-fatal)")
            }
        }
    }

    fun onEmailChange(email: String) {
        _uiState.update { it.copy(email = email, errorMessage = null) }
    }

    fun onPasswordChange(password: String) {
        _uiState.update { it.copy(password = password, errorMessage = null) }
    }

    /**
     * Restore the saved session on launch.
     * - no tokens → login form;
     * - `/auth/me` OK → signed in;
     * - 401/403 (refresh rejected) → login form;
     * - offline / timeout / 429 / 5xx → signed in with the cached user ([LoginUiState.isOfflineSession]),
     *   re-validated in the background — an offline cold start must NOT show the login form.
     */
    fun tryRestoreSession() {
        if (!authRepository.hasTokens) {
            // No session — the device keeps the LAST org's name/logo until a different org signs in.
            _uiState.update { it.copy(isRestoringSession = false) }
            return
        }

        viewModelScope.launch {
            try {
                Timber.d("LoginViewModel: restoring session...")
                val user = authRepository.fetchCurrentUser()
                Analytics.identify(user)
                loadBranding()
                _uiState.update {
                    it.copy(isRestoringSession = false, isAuthenticated = true, user = user, isOfflineSession = false)
                }
                Timber.d("LoginViewModel: session restored for ${user.email}")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (ApiErrors.isAuthRejection(e) || !authRepository.hasTokens) {
                    Timber.w(e, "LoginViewModel: session rejected, showing login")
                    _uiState.update { it.copy(isRestoringSession = false, isAuthenticated = false, user = null) }
                } else {
                    Timber.w(e, "LoginViewModel: API unreachable on restore, opening with the saved session")
                    val user = authRepository.cachedUser ?: offlinePlaceholderUser()
                    _uiState.update {
                        it.copy(isRestoringSession = false, isAuthenticated = true, user = user, isOfflineSession = true)
                    }
                    startRevalidation()
                }
            }
        }
    }

    /** Background `/auth/me` retries after an offline restore (5 s, 15 s, 30 s, then every minute). */
    private fun startRevalidation() {
        revalidateJob?.cancel()
        revalidateJob = viewModelScope.launch {
            val delays = listOf(5_000L, 15_000L, 30_000L)
            var attempt = 0
            while (_uiState.value.isAuthenticated && _uiState.value.isOfflineSession) {
                delay(delays.getOrElse(attempt) { 60_000L })
                attempt++
                try {
                    val user = authRepository.fetchCurrentUser()
                    Analytics.identify(user)
                    loadBranding()
                    _uiState.update { it.copy(user = user, isOfflineSession = false) }
                    Timber.d("LoginViewModel: session re-validated for ${user.email}")
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // 401/403 → the interceptor emits sessionEnded; anything else: retry later.
                    if (ApiErrors.isAuthRejection(e)) return@launch
                }
            }
        }
    }

    /** Only when an old install has tokens but no cached user yet: least-privileged, replaced on reconnect. */
    private fun offlinePlaceholderUser() = User(
        id = "",
        email = _uiState.value.email,
        firstName = "",
        lastName = "",
        role = UserRole.AJUTOR_COFETAR,
    )

    /**
     * Login with email and password.
     */
    fun login() {
        val state = _uiState.value
        if (!state.isFormValid || state.isLoading) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val user = authRepository.login(
                    email = state.email.trim(),
                    password = state.password,
                )
                Analytics.identify(user)
                loadBranding()
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isAuthenticated = true,
                        user = user,
                    )
                }
                Timber.d("LoginViewModel: login success for ${user.email}")
            } catch (e: Exception) {
                Timber.e(e, "LoginViewModel: login failed")
                val message = if (e is retrofit2.HttpException && e.code() == 401) {
                    "Email sau parolă greșită."
                } else {
                    ApiErrors.userMessage(e, "Autentificarea a eșuat. Încearcă din nou.")
                }
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = message,
                    )
                }
            }
        }
    }

    // --- Forgot password ("Ai uitat parola?") ---

    /** Open the reset dialog, prefilled with whatever was typed in the email field. */
    fun openForgotDialog() {
        _uiState.update {
            it.copy(
                showForgotDialog = true,
                forgotEmail = it.email,
                forgotMessage = null,
            )
        }
    }

    fun dismissForgotDialog() {
        _uiState.update { it.copy(showForgotDialog = false, forgotSubmitting = false) }
    }

    fun onForgotEmailChange(email: String) {
        _uiState.update { it.copy(forgotEmail = email) }
    }

    /**
     * Request a reset link. The backend never reveals whether the account exists, so on success we
     * always show the same neutral confirmation (mirrors iOS ForgotPasswordSheet).
     */
    fun submitForgotPassword() {
        val state = _uiState.value
        val email = state.forgotEmail.trim()
        if (email.isBlank() || state.forgotSubmitting) return

        viewModelScope.launch {
            _uiState.update { it.copy(forgotSubmitting = true) }
            try {
                authRepository.requestPasswordReset(email)
            } catch (e: Exception) {
                Timber.w(e, "LoginViewModel: forgot-password request failed (non-fatal)")
            }
            // Neutral confirmation regardless of outcome (no account enumeration).
            _uiState.update {
                it.copy(
                    forgotSubmitting = false,
                    forgotMessage = "Dacă există un cont cu acest email, vei primi un link de resetare.",
                )
            }
        }
    }

    /**
     * Logout and clear session.
     */
    fun logout() {
        revalidateJob?.cancel()
        viewModelScope.launch {
            try {
                authRepository.logout()
            } catch (e: Exception) {
                Timber.w(e, "LoginViewModel: logout error (non-fatal)")
            }
            Analytics.reset()
            _uiState.update {
                LoginUiState(isRestoringSession = false)
            }
        }
    }
}
