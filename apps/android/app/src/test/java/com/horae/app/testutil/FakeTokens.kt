package com.horae.app.testutil

import com.horae.app.data.local.TokenManager
import io.mockk.every
import io.mockk.mockk
import java.util.concurrent.atomic.AtomicInteger

/** In-memory [TokenManager] (the real one needs EncryptedSharedPreferences). */
class FakeTokens(access: String? = "old-access", refresh: String? = "old-refresh") {
    @Volatile var access: String? = access
    @Volatile var refresh: String? = refresh
    val clears = AtomicInteger(0)
    val saves = AtomicInteger(0)

    val manager: TokenManager = mockk(relaxed = true) {
        every { accessToken } answers { this@FakeTokens.access }
        every { refreshToken } answers { this@FakeTokens.refresh }
        every { hasTokens } answers { !this@FakeTokens.access.isNullOrBlank() && !this@FakeTokens.refresh.isNullOrBlank() }
        every { saveTokens(any(), any()) } answers {
            this@FakeTokens.access = firstArg()
            this@FakeTokens.refresh = secondArg()
            saves.incrementAndGet()
        }
        every { clearTokens() } answers {
            this@FakeTokens.access = null
            this@FakeTokens.refresh = null
            clears.incrementAndGet()
        }
    }
}
