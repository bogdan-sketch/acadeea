package com.horae.app.observability

import android.content.Context
import com.horae.app.BuildConfig
import com.horae.app.domain.model.User
import com.posthog.PostHog
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig
import io.sentry.Sentry
import io.sentry.android.core.SentryAndroid
import io.sentry.protocol.User as SentryUser
import timber.log.Timber

/**
 * Thin, null-safe wrapper over Sentry (errors/crash/perf) and PostHog (product analytics).
 *
 * Guarded init: an empty [BuildConfig.SENTRY_DSN] disables Sentry, an empty
 * [BuildConfig.POSTHOG_KEY] disables PostHog — both become no-ops. Keys come from gradle
 * properties (see apps/android/CLAUDE.md "Observability"); missing keys = disabled.
 *
 * Call [init] once from [com.horae.app.AcadeeaApp.onCreate]. All other methods are safe to
 * call whether or not the SDKs were initialised.
 */
object Analytics {

    private var sentryEnabled = false
    private var postHogEnabled = false

    /** Initialise the observability SDKs. Idempotent and offline-safe with empty keys. */
    fun init(context: Context) {
        val dsn = BuildConfig.SENTRY_DSN
        if (dsn.isNotBlank()) {
            SentryAndroid.init(context) { options ->
                options.dsn = dsn
                options.tracesSampleRate = 0.1
                options.environment = if (BuildConfig.DEBUG) "debug" else "release"
                options.release = BuildConfig.VERSION_NAME
                options.isEnableUncaughtExceptionHandler = true
            }
            sentryEnabled = true
            Timber.d("Analytics: Sentry initialised")
        } else {
            Timber.d("Analytics: Sentry disabled (empty DSN)")
        }

        val posthogKey = BuildConfig.POSTHOG_KEY
        if (posthogKey.isNotBlank()) {
            val config = PostHogAndroidConfig(
                apiKey = posthogKey,
                host = BuildConfig.POSTHOG_HOST,
            ).apply {
                // We send screen views manually from AppNavHost.
                captureScreenViews = false
            }
            PostHogAndroid.setup(context, config)
            postHogEnabled = true
            Timber.d("Analytics: PostHog initialised")
        } else {
            Timber.d("Analytics: PostHog disabled (empty key)")
        }
    }

    /** Associate the current [user] with both SDKs after a successful login / session restore. */
    fun identify(user: User) {
        if (postHogEnabled) {
            PostHog.identify(
                distinctId = user.id,
                userProperties = mapOf(
                    "email" to user.email,
                    "role" to user.role.name,
                ),
            )
        }
        if (sentryEnabled) {
            Sentry.setUser(
                SentryUser().apply {
                    id = user.id
                    email = user.email
                    data = mapOf("role" to user.role.name)
                },
            )
        }
    }

    /** Clear the associated user from both SDKs on logout. */
    fun reset() {
        if (postHogEnabled) {
            PostHog.reset()
        }
        if (sentryEnabled) {
            Sentry.setUser(null)
        }
    }

    /** Record a screen view (PostHog `$screen`). No-op when PostHog is disabled. */
    fun screen(name: String) {
        if (postHogEnabled) {
            PostHog.screen(name)
        }
    }

    /** Capture an arbitrary product event. No-op when PostHog is disabled. */
    fun capture(event: String, properties: Map<String, Any>? = null) {
        if (postHogEnabled) {
            PostHog.capture(event = event, properties = properties)
        }
    }
}
