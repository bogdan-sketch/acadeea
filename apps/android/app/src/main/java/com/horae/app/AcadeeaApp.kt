package com.horae.app

import android.app.Application
import com.horae.app.observability.Analytics
import com.horae.app.ui.common.RoLocale
import com.horae.app.ui.theme.SchemeStore
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber

@HiltAndroidApp
class AcadeeaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        // Romanian formatting defaults + the device's colour scheme, before any UI.
        RoLocale.applyDefault()
        SchemeStore.init(this)
        // Errors/crash/perf (Sentry) + product analytics (PostHog).
        // Guarded internally: empty keys => the respective SDK init is skipped (no-op).
        Analytics.init(this)
    }
}
