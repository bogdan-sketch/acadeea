package com.horae.app.ui.profile

import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Text
import coil.compose.SubcomposeAsyncImage
import com.horae.app.BuildConfig
import com.horae.app.domain.model.User
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme

/**
 * Image sources from the API: a `data:` URI (avatars), an absolute URL, or a path
 * relative to the API ("/api/v1/organization/by-slug/…/logo/login-light", logos).
 */
object HoraeImages {
    /** Bumped after a logo upload/removal so Coil does not serve the cached bytes. */
    var logoRevision by mutableIntStateOf(0)

    /** Coil model for [raw]: decoded bytes for a data URI, else a full URL; null when blank. */
    fun model(raw: String?, revision: Int = 0): Any? {
        val value = raw?.trim().takeUnless { it.isNullOrEmpty() } ?: return null
        if (value.startsWith("data:")) {
            val comma = value.indexOf(',')
            if (comma < 0) return null
            return runCatching { Base64.decode(value.substring(comma + 1), Base64.DEFAULT) }.getOrNull()
        }
        val url = if (value.startsWith("http://") || value.startsWith("https://")) {
            value
        } else {
            BuildConfig.BASE_URL.trimEnd('/') + "/" + value.trimStart('/')
        }
        return if (revision > 0) url + (if ('?' in url) "&" else "?") + "v=$revision" else url
    }
}

/**
 * The signed-in user's circle: photo when there is one, else the initials on the accent.
 * [ring] draws the white outline used on the Panou bubble.
 */
@Composable
fun UserAvatar(user: User?, size: Dp, modifier: Modifier = Modifier, ring: Boolean = false) {
    val s = HoraeTheme.scheme
    val model = remember(user?.avatarUrl) { HoraeImages.model(user?.avatarUrl) }
    val base = modifier
        .size(size)
        .clip(CircleShape)
        .let { if (ring) it.border(1.5.dp, Color.White.copy(alpha = 0.9f), CircleShape) else it }
    val initials: @Composable () -> Unit = {
        Box(Modifier.fillMaxSize().background(s.primary), contentAlignment = Alignment.Center) {
            Text(
                user?.initials ?: "?",
                style = AppFont.body((size.value * 0.36f).coerceAtLeast(11f), FontWeight.Bold),
                color = s.onPrimary,
            )
        }
    }
    Box(base, contentAlignment = Alignment.Center) {
        if (model == null) {
            initials()
        } else {
            SubcomposeAsyncImage(
                model = model,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                loading = { initials() },
                error = { initials() },
            )
        }
    }
}

/** Mutable copy of the signed-in user after a Profil edit (name, photo), until the next /auth/me. */
object CurrentUserStore {
    var updated by mutableStateOf<User?>(null)

    /** The freshest version of [user]: the Profil edit when it is the same person. */
    fun resolve(user: User?): User? = updated?.takeIf { it.id == user?.id } ?: user
}
