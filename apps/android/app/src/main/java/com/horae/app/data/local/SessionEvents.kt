package com.horae.app.data.local

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Why the signed-in session ended without the user tapping "Deconectare". */
enum class SessionEndReason {
    /** The refresh token was rejected (401/403) or missing — sign in again. */
    EXPIRED,
}

/**
 * App-wide session signal. `AuthInterceptor` emits [ended] when the server rejects the
 * refresh token (ONLY 401/403 — throttling, 5xx and offline never end a session).
 * `LoginViewModel` collects it and flips `isAuthenticated` to false, so the nav host
 * (AppNavHost observes `LoginViewModel.uiState`) returns to the login form. Any other
 * UI that must react (e.g. clearing a cache) can collect [ended] too.
 *
 * A user-initiated logout does NOT emit here.
 */
@Singleton
class SessionEvents @Inject constructor() {
    private val _ended = MutableSharedFlow<SessionEndReason>(
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    val ended: SharedFlow<SessionEndReason> = _ended.asSharedFlow()

    fun notifyEnded(reason: SessionEndReason = SessionEndReason.EXPIRED) {
        _ended.tryEmit(reason)
    }
}
