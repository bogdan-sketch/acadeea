package com.horae.app

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.horae.app.ui.common.ComponentGallery
import com.horae.app.ui.common.RoLocale
import com.horae.app.ui.navigation.AppNavHost
import com.horae.app.ui.theme.HoraeTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    // Romanian everywhere (M3 DatePicker month names, Monday-first weeks), whatever the device language.
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(RoLocale.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Debug only: `--ez horae.gallery true` opens the design-system gallery (ui/common/ComponentGallery).
        val showGallery = BuildConfig.DEBUG && intent.getBooleanExtra(EXTRA_GALLERY, false)
        setContent {
            // The device's scheme (SchemeStore, one of six) — never tenant colours or fonts.
            HoraeTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    if (showGallery) ComponentGallery() else AppNavHost()
                }
            }
        }
    }

    companion object {
        const val EXTRA_GALLERY = "horae.gallery"
    }
}
