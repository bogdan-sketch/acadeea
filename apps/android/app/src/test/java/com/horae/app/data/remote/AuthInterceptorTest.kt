package com.horae.app.data.remote

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import com.horae.app.data.local.SessionEndReason
import com.horae.app.data.local.SessionEvents
import com.horae.app.data.remote.interceptor.AuthInterceptor
import com.horae.app.data.remote.interceptor.SessionRefreshUnavailableException
import com.horae.app.testutil.FakeTokens
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** 401 → refresh → retry; only a rejected refresh (401/403) ends the session. */
class AuthInterceptorTest {

    private lateinit var server: MockWebServer
    private lateinit var tokens: FakeTokens
    private lateinit var events: SessionEvents
    private lateinit var client: OkHttpClient
    private val moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()

    private val refreshCalls = AtomicInteger(0)
    /** What `/auth/refresh` answers; default = new tokens. */
    @Volatile private var refreshResponse: () -> MockResponse = { tokensJson("new-access", "new-refresh") }

    private fun tokensJson(a: String, r: String) =
        MockResponse().setResponseCode(200).setBody("""{"accessToken":"$a","refreshToken":"$r"}""")

    @Before fun setUp() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path.orEmpty()
                return when {
                    path.startsWith("/api/v1/auth/refresh") -> { refreshCalls.incrementAndGet(); refreshResponse() }
                    path.startsWith("/api/v1/auth/login") -> MockResponse().setResponseCode(200).setBody("{}")
                    request.getHeader("Authorization") == "Bearer new-access" -> MockResponse().setResponseCode(200).setBody("ok")
                    request.getHeader("Authorization") == "Bearer good" -> MockResponse().setResponseCode(200).setBody("ok")
                    else -> MockResponse().setResponseCode(401).setBody("""{"statusCode":401,"errorCode":"AUTH_002"}""")
                }
            }
        }
        server.start()
        tokens = FakeTokens()
        events = spyk(SessionEvents())
        client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokens.manager, moshi, events))
            .readTimeout(5, TimeUnit.SECONDS)
            .build()
    }

    @After fun tearDown() {
        server.shutdown()
    }

    private fun get(path: String = "/api/v1/tasks?page=1"): Response =
        client.newCall(Request.Builder().url(server.url(path)).build()).execute()

    private fun takeAll(): List<RecordedRequest> = buildList {
        while (true) add(server.takeRequest(100, TimeUnit.MILLISECONDS) ?: break)
    }

    @Test fun `attaches the bearer token`() {
        tokens.access = "good"
        get().use { assertThat(it.code).isEqualTo(200) }
        assertThat(server.takeRequest().getHeader("Authorization")).isEqualTo("Bearer good")
        assertThat(refreshCalls.get()).isEqualTo(0)
    }

    @Test fun `login and refresh endpoints get no auth header`() {
        get("/api/v1/auth/login").use { assertThat(it.code).isEqualTo(200) }
        assertThat(server.takeRequest().getHeader("Authorization")).isNull()
    }

    @Test fun `401 refreshes once and retries with the new token`() {
        get().use { r ->
            assertThat(r.code).isEqualTo(200)
            assertThat(r.body!!.string()).isEqualTo("ok")
        }
        val reqs = takeAll()
        assertThat(reqs.map { it.path!!.substringBefore('?') })
            .containsExactly("/api/v1/tasks", "/api/v1/auth/refresh", "/api/v1/tasks").inOrder()
        assertThat(reqs[0].getHeader("Authorization")).isEqualTo("Bearer old-access")
        assertThat(reqs[1].method).isEqualTo("POST")
        assertThat(reqs[1].body.readUtf8()).isEqualTo("""{"refreshToken":"old-refresh"}""")
        assertThat(reqs[2].getHeader("Authorization")).isEqualTo("Bearer new-access")
        assertThat(reqs[2].path).isEqualTo("/api/v1/tasks?page=1") // original query kept
        assertThat(tokens.access).isEqualTo("new-access")
        assertThat(tokens.refresh).isEqualTo("new-refresh")
        verify(exactly = 0) { events.notifyEnded(any()) }
    }

    @Test fun `401 without an access token is returned as is`() {
        tokens.access = null
        get().use { assertThat(it.code).isEqualTo(401) }
        assertThat(refreshCalls.get()).isEqualTo(0)
        assertThat(tokens.clears.get()).isEqualTo(0)
    }

    @Test fun `401 without a refresh token ends the session`() {
        tokens.refresh = null
        get().use { assertThat(it.code).isEqualTo(401) }
        assertThat(refreshCalls.get()).isEqualTo(0)
        assertThat(tokens.clears.get()).isEqualTo(1)
        verify(exactly = 1) { events.notifyEnded(SessionEndReason.EXPIRED) }
    }

    @Test fun `refresh 401 clears tokens and ends the session`() {
        refreshResponse = { MockResponse().setResponseCode(401) }
        get().use {
            assertThat(it.code).isEqualTo(401)
            // The caller still gets the original error body (AUTH_002) to map to Romanian.
            assertThat(it.body!!.string()).contains("AUTH_002")
        }
        assertThat(tokens.access).isNull()
        assertThat(tokens.refresh).isNull()
        verify(exactly = 1) { events.notifyEnded(any()) }
    }

    @Test fun `refresh 403 clears tokens and ends the session`() {
        refreshResponse = { MockResponse().setResponseCode(403) }
        get().use { assertThat(it.code).isEqualTo(401) }
        assertThat(tokens.clears.get()).isEqualTo(1)
        verify(exactly = 1) { events.notifyEnded(any()) }
    }

    @Test fun `ended is emitted on the session flow`() = runTest {
        refreshResponse = { MockResponse().setResponseCode(401) }
        events.ended.test {
            get().close()
            assertThat(awaitItem()).isEqualTo(SessionEndReason.EXPIRED)
        }
    }

    private fun assertUnavailable(expectedCode: Int?, checkCode: Boolean = true): SessionRefreshUnavailableException {
        try {
            get().close()
            fail("expected SessionRefreshUnavailableException")
            throw AssertionError()
        } catch (e: SessionRefreshUnavailableException) {
            if (checkCode) assertThat(e.httpCode).isEqualTo(expectedCode)
            assertThat(tokens.access).isEqualTo("old-access")
            assertThat(tokens.refresh).isEqualTo("old-refresh")
            assertThat(tokens.clears.get()).isEqualTo(0)
            verify(exactly = 0) { events.notifyEnded(any()) }
            assertThat(ApiErrors.isRetryable(e)).isTrue()
            assertThat(ApiErrors.isAuthRejection(e)).isFalse()
            return e
        }
    }

    @Test fun `refresh 429 keeps the session and is retryable`() {
        refreshResponse = { MockResponse().setResponseCode(429) }
        val e = assertUnavailable(429)
        assertThat(ApiErrors.userMessage(e)).isEqualTo(ApiErrors.THROTTLED_MESSAGE)
    }

    @Test fun `refresh 500 keeps the session and is retryable`() {
        refreshResponse = { MockResponse().setResponseCode(500) }
        val e = assertUnavailable(500)
        assertThat(ApiErrors.userMessage(e)).isEqualTo(ApiErrors.SESSION_RETRY_MESSAGE)
    }

    @Test fun `refresh 503 keeps the session`() {
        refreshResponse = { MockResponse().setResponseCode(503) }
        assertUnavailable(503)
    }

    @Test fun `refresh network failure keeps the session`() {
        refreshResponse = { MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START) }
        val e = assertUnavailable(null)
        assertThat(ApiErrors.userMessage(e)).isEqualTo(ApiErrors.OFFLINE_MESSAGE)
    }

    @Test fun `refresh 200 with an unreadable body keeps the session`() {
        refreshResponse = { MockResponse().setResponseCode(200).setBody("not json") }
        assertUnavailable(null, checkCode = false)
    }

    @Test fun `a retried request that is still 401 does not refresh again`() {
        refreshResponse = { tokensJson("still-bad", "r2") }
        get().use { assertThat(it.code).isEqualTo(401) }
        assertThat(refreshCalls.get()).isEqualTo(1)
        assertThat(tokens.access).isEqualTo("still-bad")
    }

    @Test fun `concurrent 401s refresh only once`() {
        refreshResponse = { tokensJson("new-access", "new-refresh").setBodyDelay(200, TimeUnit.MILLISECONDS) }
        val n = 6
        val pool = Executors.newFixedThreadPool(n)
        val start = CountDownLatch(1)
        val codes = (1..n).map {
            pool.submit<Int> {
                start.await()
                get().use { it.code }
            }
        }
        start.countDown()
        val results = codes.map { it.get(10, TimeUnit.SECONDS) }
        pool.shutdown()
        assertThat(results).containsExactlyElementsIn(List(n) { 200 })
        assertThat(refreshCalls.get()).isEqualTo(1)
        assertThat(tokens.saves.get()).isEqualTo(1)
    }
}
