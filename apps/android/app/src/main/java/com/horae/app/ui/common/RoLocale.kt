package com.horae.app.ui.common

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/**
 * The app runs in Romanian (ro-RO) whatever the device language: Material date
 * pickers, month/day names and default `String.format` / `DateTimeFormatter`
 * output are Romanian, and weeks start on Monday.
 *
 * Wired in `AcadeeaApp.onCreate` ([applyDefault]) and `MainActivity.attachBaseContext`
 * ([wrap]). Time zone: see [RoDate.zone] (Europe/Bucharest) — formatting code passes it
 * explicitly instead of trusting the device zone.
 */
object RoLocale {
    val locale: Locale = Locale("ro", "RO")

    fun applyDefault() {
        Locale.setDefault(locale)
    }

    fun wrap(base: Context): Context {
        val config = Configuration(base.resources.configuration)
        config.setLocale(locale)
        return base.createConfigurationContext(config)
    }
}
