package com.horae.app.data.remote

import com.google.common.truth.Truth.assertThat
import com.horae.app.data.remote.interceptor.SessionRefreshUnavailableException
import kotlinx.coroutines.CancellationException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/** errorCode → Romanian copy; cancellation / retryable / auth-rejection classification. */
class ApiErrorsTest {

    private fun http(code: Int, body: String = "") =
        HttpException(Response.error<Any>(code, body.toResponseBody("application/json".toMediaType())))

    private fun coded(code: Int, errorCode: String, message: String? = null) =
        http(code, """{"statusCode":$code,"errorCode":"$errorCode"${message?.let { ",\"message\":\"$it\"" } ?: ""}}""")

    // ── parse ────────────────────────────────────────────────────────────

    @Test fun `parse reads status, errorCode and message`() {
        val err = ApiErrors.parse(coded(400, "STOCK_001", "Stoc insuficient pentru Făină"))!!
        assertThat(err.status).isEqualTo(400)
        assertThat(err.errorCode).isEqualTo("STOCK_001")
        assertThat(err.message).isEqualTo("Stoc insuficient pentru Făină")
    }

    @Test fun `parse takes the first validation message and the legacy code field`() {
        val err = ApiErrors.parse(http(400, """{"code":"RECIPE_003","message":["Cantitate invalidă","alt"]}"""))!!
        assertThat(err.errorCode).isEqualTo("RECIPE_003")
        assertThat(err.message).isEqualTo("Cantitate invalidă")
    }

    @Test fun `parse survives empty and broken bodies`() {
        assertThat(ApiErrors.parse(http(502))).isEqualTo(ApiError(502, null, null))
        assertThat(ApiErrors.parse(http(400, "<html>"))).isEqualTo(ApiError(400, null, null))
        assertThat(ApiErrors.parse(IOException())).isNull()
        assertThat(ApiErrors.errorCode(coded(409, "TASK_002"))).isEqualTo("TASK_002")
        assertThat(ApiErrors.errorCode(RuntimeException())).isNull()
    }

    // ── userMessage ──────────────────────────────────────────────────────

    @Test fun `every known code maps to its Romanian copy`() {
        ApiErrors.messages.forEach { (code, copy) ->
            if (code == "SALES_001") return@forEach
            assertThat(ApiErrors.userMessage(coded(400, code, "English server text"))).isEqualTo(copy)
        }
    }

    @Test fun `the map mirrors the shared error codes`() {
        assertThat(ApiErrors.messages.keys).containsAtLeast(
            "AUTH_001", "AUTH_002", "AUTH_003", "AUTH_004", "STOCK_001", "STOCK_002", "STOCK_003", "STOCK_004",
            "TASK_001", "TASK_002", "TASK_003", "TASK_BLOCKED_INSUFFICIENT_STOCK", "RECIPE_001", "RECIPE_002",
            "RECIPE_003", "SALES_001", "SALES_002",
        )
        ApiErrors.messages.values.forEach { assertThat(it).endsWith(".") }
    }

    @Test fun `specific codes`() {
        assertThat(ApiErrors.userMessage(coded(401, "AUTH_001"))).isEqualTo("Email sau parolă greșită.")
        assertThat(ApiErrors.userMessage(coded(409, "TASK_BLOCKED_INSUFFICIENT_STOCK")))
            .isEqualTo("Sarcina nu poate porni — stoc insuficient (mutată în BLOCAT).")
        assertThat(ApiErrors.userMessage(coded(400, "STOCK_001"))).isEqualTo("Stoc insuficient.")
    }

    @Test fun `SALES_001 prefers the server message that lists products`() {
        assertThat(ApiErrors.userMessage(coded(400, "SALES_001", "Tort fistic: 3 buc lipsă")))
            .isEqualTo("Tort fistic: 3 buc lipsă")
        assertThat(ApiErrors.userMessage(coded(400, "SALES_001"))).isEqualTo(ApiErrors.messages["SALES_001"])
    }

    @Test fun `unknown code falls back by status`() {
        assertThat(ApiErrors.userMessage(coded(429, "NEW_CODE"))).isEqualTo(ApiErrors.THROTTLED_MESSAGE)
        assertThat(ApiErrors.userMessage(http(500))).isEqualTo(ApiErrors.SERVER_MESSAGE)
        assertThat(ApiErrors.userMessage(http(503))).isEqualTo(ApiErrors.SERVER_MESSAGE)
    }

    @Test fun `human Romanian server text is shown, framework English is not`() {
        assertThat(ApiErrors.userMessage(http(400, """{"message":"Numele există deja"}"""), "fallback"))
            .isEqualTo("Numele există deja")
        listOf("Bad Request", "Not Found", "Forbidden", "Internal server error", "HTTP 400 ").forEach { m ->
            assertThat(ApiErrors.userMessage(http(400, """{"message":"$m"}"""), "fallback")).isEqualTo("fallback")
        }
        assertThat(ApiErrors.userMessage(http(404), "Nu am găsit")).isEqualTo("Nu am găsit")
    }

    @Test fun `network errors never show raw exception text`() {
        assertThat(ApiErrors.userMessage(UnknownHostException("Unable to resolve host api.horae.ca")))
            .isEqualTo(ApiErrors.OFFLINE_MESSAGE)
        assertThat(ApiErrors.userMessage(SocketTimeoutException("timeout"))).isEqualTo(ApiErrors.TIMEOUT_MESSAGE)
        assertThat(ApiErrors.userMessage(IllegalStateException("boom"))).isEqualTo(ApiErrors.DEFAULT_MESSAGE)
        assertThat(ApiErrors.userMessage(IllegalStateException("boom"), "Altceva")).isEqualTo("Altceva")
    }

    @Test fun `refresh unavailable messages`() {
        assertThat(ApiErrors.userMessage(SessionRefreshUnavailableException(429))).isEqualTo(ApiErrors.THROTTLED_MESSAGE)
        assertThat(ApiErrors.userMessage(SessionRefreshUnavailableException(500))).isEqualTo(ApiErrors.SESSION_RETRY_MESSAGE)
        assertThat(ApiErrors.userMessage(SessionRefreshUnavailableException(null))).isEqualTo(ApiErrors.OFFLINE_MESSAGE)
    }

    // ── classification ───────────────────────────────────────────────────

    @Test fun `isCancellation`() {
        assertThat(ApiErrors.isCancellation(CancellationException("left"))).isTrue()
        assertThat(ApiErrors.isCancellation(IOException("Canceled"))).isTrue()
        assertThat(ApiErrors.isCancellation(InterruptedIOException())).isTrue()
        assertThat(ApiErrors.isCancellation(RuntimeException(CancellationException()))).isTrue() // wrapped
        assertThat(ApiErrors.isCancellation(SocketTimeoutException())).isFalse() // a timeout is a real error
        assertThat(ApiErrors.isCancellation(IOException("reset"))).isFalse()
        assertThat(ApiErrors.isCancellation(http(500))).isFalse()
    }

    @Test fun `isRetryable`() {
        assertThat(ApiErrors.isRetryable(IOException())).isTrue()
        assertThat(ApiErrors.isRetryable(SocketTimeoutException())).isTrue()
        assertThat(ApiErrors.isRetryable(http(429))).isTrue()
        assertThat(ApiErrors.isRetryable(http(500))).isTrue()
        assertThat(ApiErrors.isRetryable(http(502))).isTrue()
        assertThat(ApiErrors.isRetryable(http(400))).isFalse()
        assertThat(ApiErrors.isRetryable(http(401))).isFalse()
        assertThat(ApiErrors.isRetryable(http(404))).isFalse()
        assertThat(ApiErrors.isRetryable(IllegalStateException())).isFalse()
    }

    @Test fun `isAuthRejection only for 401 and 403`() {
        assertThat(ApiErrors.isAuthRejection(http(401))).isTrue()
        assertThat(ApiErrors.isAuthRejection(http(403))).isTrue()
        assertThat(ApiErrors.isAuthRejection(http(429))).isFalse()
        assertThat(ApiErrors.isAuthRejection(http(500))).isFalse()
        assertThat(ApiErrors.isAuthRejection(IOException())).isFalse()
    }
}
