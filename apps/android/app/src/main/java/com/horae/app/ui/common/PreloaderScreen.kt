package com.horae.app.ui.common

import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.horae.app.ui.auth.LoginViewModel
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/** Formation duration — AppNavHost keeps the preloader up at least this long… */
const val PRELOADER_MIN_DURATION_MS = 2500L

/** …plus a short hold on the finished vortex before dismissal (min total ~2900ms). */
const val PRELOADER_HOLD_MS = 400L

private val NearBlack = Color(0xFF0D0D0F)

/** Dark "pill" field background from the Claude Design splash-form (≈#1C1C1E). */
private val FieldBackground = Color(0xFF1C1C1E)

/** How long the vortex formation runs (once) — mirrors iOS SplashView.formationDuration. */
private const val FORMATION_DURATION_MS = 2500

/**
 * How far the logo/glow lifts when the login form is revealed. iOS lifts ~150dp (design
 * translateY(-235px) scaled to the phone), and the form fades in below the lifted center.
 */
private val SPLASH_LOGO_LIFT: Dp = 150.dp

/** One vortex dot: the FINAL position/opacity (dp/rad) + its animation stagger. */
private data class VortexDot(
    val radius: Float, // dp from center
    val angle: Float, // rad
    val size: Float, // dp diameter (1.0–1.8 → dot radius ~0.5–0.9dp)
    val alpha: Float,
    /** 0..0.4 — per-dot start delay so the dots don't arrive in unison. */
    val delay: Float,
)

/**
 * The design's texture: spiral ARMS of tiny dots — dense, strongly curved, a clear hole in the
 * middle for the org name/logo, sparser and more transparent toward the outside. Deterministic
 * sin-hash pseudo-random (no Random()); mirrors iOS SplashView.dots 1:1.
 */
private val VORTEX_DOTS: List<VortexDot> = buildList {
    val arms = 32
    val innerRadius = 88.0
    val outerRadius = 230.0 // compact, like the design (~screen width)
    val step = 3.6 // dots close together → the arm reads as a LINE
    val twist = 0.0135 // rad per dp — arm curvature
    for (arm in 0 until arms) {
        val baseAngle = arm.toDouble() / arms * 2 * PI
        var r = innerRadius
        var j = 0
        while (r <= outerRadius) {
            val fi = (arm * 97 + j).toDouble()
            val h1 = abs(sin(fi * 12.9898 + 78.233)) // stable pseudo-random
            val h2 = abs(sin(fi * 39.3468 + 11.135))
            val normalized = (r - innerRadius) / (outerRadius - innerRadius)
            // The arm stays CONTINUOUS on the inside; only the tip thins out.
            if (normalized > 0.7 && h1 > 1.55 - normalized) {
                r += step
                j++
                continue
            }
            val angle = baseAngle + (r - innerRadius) * twist
            // Inner ramp: the innermost dots melt into the center glow instead of forming a
            // hard inner ring (mirrors iOS innerFade = min(1, normalized / 0.3)).
            val innerFade = (normalized / 0.3).coerceAtMost(1.0)
            val falloff = (0.8 - normalized * 0.68).coerceAtLeast(0.08) * innerFade
            add(
                VortexDot(
                    radius = r.toFloat(),
                    angle = angle.toFloat(),
                    size = (1.0 + h2 * 0.8).toFloat(),
                    alpha = (falloff * (0.7 + h1 * 0.3)).toFloat(),
                    delay = (h2 * 0.4).toFloat(),
                ),
            )
            r += step
            j++
        }
    }
}

/** True when the device's animator scale is 0 (animations disabled / reduced motion). */
@Composable
internal fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    return remember {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) == 0f
    }
}

/** Single 0→1 timeline for the whole vortex formation (per-dot delay/easing applied at draw). */
@Composable
private fun rememberFormationProgress(reduceMotion: Boolean): State<Float> {
    val progress = remember { Animatable(if (reduceMotion) 1f else 0f) }
    LaunchedEffect(reduceMotion) {
        if (!reduceMotion && progress.value < 1f) {
            progress.animateTo(
                targetValue = 1f,
                animationSpec = tween(durationMillis = FORMATION_DURATION_MS, easing = LinearEasing),
            )
        }
    }
    return progress.asState()
}

/**
 * Shared splash surface: near-black + accent gradient, the procedural dot-vortex, the soft center
 * glow (which lifts with the would-be logo) and the bottom "Horae" tagline. Both the plain
 * [PreloaderScreen] and the login-reveal [SplashLoginScreen] render through this so the vortex is
 * drawn once, in one place.
 *
 * @param logoLift how far up the center glow (logo slot) is shifted; the vortex itself stays put.
 * @param taglineAlpha fades the bottom "Horae" tagline out so it doesn't clash with the login form.
 * @param overlay extra content on top of the splash (the login form when revealing login).
 */
@Composable
private fun SplashSurface(
    accentColor: Color,
    progress: Float,
    logoLift: Dp,
    taglineAlpha: Float,
    overlay: @Composable BoxScope.() -> Unit = {},
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(NearBlack)
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        accentColor.copy(alpha = 0.92f),
                        accentColor.copy(alpha = 0.70f),
                        accentColor.copy(alpha = 0.25f),
                    ),
                ),
            ),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val centerX = size.width / 2f
            val centerY = size.height / 2f
            val liftPx = logoLift.toPx()
            val canvasCenter = Offset(centerX, centerY)

            // Soft radial glow in the vortex's clear center — softens the hard edge of the hole
            // (and sits behind the org logo once one can render): white 0.16 → 0.05 → transparent;
            // full strength until ~20dp, gone by ~175dp. Lifts with the logo slot.
            val glowEndPx = 175.dp.toPx()
            val glowStartStop = (20.dp.toPx() / glowEndPx).coerceIn(0f, 1f)
            val glowCenter = Offset(centerX, centerY - liftPx)
            drawCircle(
                brush = Brush.radialGradient(
                    colorStops = arrayOf(
                        0f to Color.White.copy(alpha = 0.16f),
                        glowStartStop to Color.White.copy(alpha = 0.16f),
                        glowStartStop + (1f - glowStartStop) / 2f to Color.White.copy(alpha = 0.05f),
                        1f to Color.Transparent,
                    ),
                    center = glowCenter,
                    radius = glowEndPx,
                ),
                radius = glowEndPx,
                center = glowCenter,
            )

            val entryOffsetPx = 110.dp.toPx()
            for (dot in VORTEX_DOTS) {
                // The DOT's own progress: starts after its delay, lasts the remaining span.
                val span = (1f - dot.delay).coerceAtLeast(0.15f)
                val local = ((progress - dot.delay) / span).coerceIn(0f, 1f)
                if (local <= 0f) continue
                val eased = 1f - (1f - local).pow(3) // ease-out cubic

                val radius = dot.radius.dp.toPx() + (1f - eased) * entryOffsetPx // comes from outside
                val angle = dot.angle - (1f - eased) * 0.55f // twists back into place
                drawCircle(
                    // Whole vortex dimmed to 60% (mirrors iOS: dot.alpha * eased * 0.6).
                    color = Color.White.copy(alpha = dot.alpha * eased * 0.6f),
                    radius = dot.size.dp.toPx() / 2f,
                    center = Offset(
                        x = centerX + cos(angle) * radius,
                        y = centerY + sin(angle) * radius,
                    ),
                )
            }
        }

        // The center stays EMPTY (vortex + glow only) — matching iOS/web, where only a real org
        // logo may appear there; Android has no image-loading lib yet, so nothing renders.

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 64.dp)
                .alpha(taglineAlpha),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = com.horae.app.BuildConfig.BRAND_NAME,
                color = Color.White,
                style = AppFont.title(24f),
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Toată producția ta într-un loc organizat",
                color = Color.White.copy(alpha = 0.7f),
                style = AppFont.body(15f),
            )
        }

        overlay()
    }
}

/**
 * [accentColor] is ignored since the 17.10.2026 redesign: the splash always uses the
 * device scheme's accent (`HoraeTheme.scheme.primary`), never a tenant colour.
 *
 * Designer's launch splash (matches iOS SplashView / the Claude Design "Loading" screen):
 * full-screen accent gradient over near-black and a procedural dot-vortex texture (spiral arms)
 * with a soft radial glow in its clear center. The formation animation runs ONCE, 2.5s; animator
 * scale 0 (reduced motion) → the final state is drawn directly.
 */
@Composable
fun PreloaderScreen(
    @Suppress("UNUSED_PARAMETER") accentColor: Color = Color.Unspecified,
) {
    val accentColor = HoraeTheme.scheme.primary
    val reduceMotion = rememberReduceMotion()
    val progress by rememberFormationProgress(reduceMotion)
    SplashSurface(
        accentColor = accentColor,
        progress = progress,
        logoLift = 0.dp,
        taglineAlpha = 1f,
    )
}

/**
 * The logged-out flow: the same splash (gradient + vortex forms once), then — once [showLogin]
 * flips true (the vortex has formed and nobody is authenticated) — the logo slot LIFTS up and the
 * login form fades in on the SAME gradient, becoming part of the splash. Mirrors iOS SplashView's
 * `showLogin` reveal. Reduced motion renders the final state (logo up, form visible) immediately.
 *
 * Preserves all existing login logic — it drives the shared [LoginViewModel]; only the form is
 * restyled onto the dark gradient and wrapped in the reveal animation.
 */
@Composable
fun SplashLoginScreen(
    @Suppress("UNUSED_PARAMETER") accentColor: Color = Color.Unspecified,
    showLogin: Boolean,
    viewModel: LoginViewModel,
) {
    val accentColor = HoraeTheme.scheme.primary
    val reduceMotion = rememberReduceMotion()
    val progress by rememberFormationProgress(reduceMotion)

    // On reveal: the logo slot rises, the form fades in below it, the bottom tagline fades out.
    val logoLift by animateDpAsState(
        targetValue = if (showLogin) SPLASH_LOGO_LIFT else 0.dp,
        animationSpec = if (reduceMotion) snap() else tween(1000, easing = FastOutSlowInEasing),
        label = "splashLogoLift",
    )
    val taglineAlpha by animateFloatAsState(
        targetValue = if (showLogin) 0f else 1f,
        animationSpec = if (reduceMotion) snap() else tween(600, easing = FastOutSlowInEasing),
        label = "splashTaglineAlpha",
    )

    SplashSurface(
        accentColor = accentColor,
        progress = progress,
        logoLift = logoLift,
        taglineAlpha = taglineAlpha,
    ) {
        AnimatedVisibility(
            visible = showLogin,
            enter = fadeIn(tween(if (reduceMotion) 0 else 1000, easing = FastOutSlowInEasing)),
            exit = fadeOut(tween(if (reduceMotion) 0 else 400)),
            modifier = Modifier.align(Alignment.Center),
        ) {
            SplashLoginForm(viewModel = viewModel, accentColor = accentColor)
        }
    }

    // Forgot-password ("Ai uitat parola?") dialog, rendered above the splash.
    val uiState by viewModel.uiState.collectAsState()
    if (uiState.showForgotDialog) {
        ForgotPasswordDialog(viewModel = viewModel, accentColor = HoraeTheme.scheme.primaryText)
    }
}

/**
 * The Claude Design "splash-form": dark pill fields with grey placeholders, a password eye toggle,
 * a right-aligned accent "Ai uitat parola?" link and an accent "Autentificare" button — laid out
 * below the lifted logo slot on the accent gradient.
 */
@Composable
private fun SplashLoginForm(
    viewModel: LoginViewModel,
    accentColor: Color,
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current
    var showPassword by rememberSaveable { mutableStateOf(false) }

    val fieldColors = TextFieldDefaults.colors(
        focusedContainerColor = FieldBackground,
        unfocusedContainerColor = FieldBackground,
        disabledContainerColor = FieldBackground,
        focusedIndicatorColor = Color.Transparent,
        unfocusedIndicatorColor = Color.Transparent,
        disabledIndicatorColor = Color.Transparent,
        cursorColor = Color.White,
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        disabledTextColor = Color.White.copy(alpha = 0.6f),
        focusedPlaceholderColor = Color.White.copy(alpha = 0.5f),
        unfocusedPlaceholderColor = Color.White.copy(alpha = 0.5f),
        focusedTrailingIconColor = Color.White.copy(alpha = 0.7f),
        unfocusedTrailingIconColor = Color.White.copy(alpha = 0.7f),
    )
    val pillShape = RoundedCornerShape(14.dp)

    Column(
        modifier = Modifier
            .widthIn(max = 400.dp)
            .fillMaxWidth()
            .padding(horizontal = 24.dp)
            // Sit below the lifted logo slot, and rise above the keyboard when it opens.
            .offset(y = 56.dp)
            .imePadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Email pill
        TextField(
            value = uiState.email,
            onValueChange = viewModel::onEmailChange,
            placeholder = { Text("Email") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = pillShape,
            colors = fieldColors,
            enabled = !uiState.isLoading,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
        )

        Spacer(modifier = Modifier.height(14.dp))

        // Password pill with eye toggle
        TextField(
            value = uiState.password,
            onValueChange = viewModel::onPasswordChange,
            placeholder = { Text("Parolă") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = pillShape,
            colors = fieldColors,
            enabled = !uiState.isLoading,
            visualTransformation = if (showPassword) {
                VisualTransformation.None
            } else {
                PasswordVisualTransformation()
            },
            trailingIcon = {
                IconButton(onClick = { showPassword = !showPassword }) {
                    Icon(
                        imageVector = if (showPassword) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = if (showPassword) "Ascunde parola" else "Arată parola",
                    )
                }
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(
                onDone = {
                    focusManager.clearFocus()
                    viewModel.login()
                },
            ),
        )

        Spacer(modifier = Modifier.height(6.dp))

        // Right-aligned "Ai uitat parola?" link — white on the gradient (never accent on accent).
        TextButton(
            onClick = { viewModel.openForgotDialog() },
            modifier = Modifier.align(Alignment.End),
            colors = ButtonDefaults.textButtonColors(contentColor = Color.White),
        ) {
            Text("Ai uitat parola?", style = AppFont.body(14f, FontWeight.SemiBold))
        }

        if (uiState.errorMessage != null) {
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = uiState.errorMessage!!,
                color = Color.White,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(modifier = Modifier.height(18.dp))

        // Accent "Autentificare" button
        Button(
            onClick = {
                focusManager.clearFocus()
                viewModel.login()
            },
            enabled = uiState.isFormValid && !uiState.isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = pillShape,
            colors = ButtonDefaults.buttonColors(
                containerColor = accentColor,
                contentColor = Color.White,
                // Disabled stays readable: a frosted white pill with white text.
                disabledContainerColor = Color.White.copy(alpha = 0.25f),
                disabledContentColor = Color.White.copy(alpha = 0.85f),
            ),
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(22.dp),
                    color = Color.White,
                    strokeWidth = 2.dp,
                )
            } else {
                Text("Autentificare", style = AppFont.body(16f, FontWeight.SemiBold))
            }
        }
    }
}

/** Collects an email and requests a reset link (mirrors iOS ForgotPasswordSheet). */
@Composable
private fun ForgotPasswordDialog(
    viewModel: LoginViewModel,
    accentColor: Color,
) {
    val uiState by viewModel.uiState.collectAsState()
    val sent = uiState.forgotMessage != null

    AlertDialog(
        onDismissRequest = { viewModel.dismissForgotDialog() },
        title = { Text("Resetare parolă") },
        text = {
            if (sent) {
                Text(uiState.forgotMessage!!)
            } else {
                Column {
                    Text("Introdu adresa de email și îți trimitem un link de resetare.")
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = uiState.forgotEmail,
                        onValueChange = viewModel::onForgotEmailChange,
                        placeholder = { Text("Email") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !uiState.forgotSubmitting,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    )
                }
            }
        },
        confirmButton = {
            if (sent) {
                TextButton(
                    onClick = { viewModel.dismissForgotDialog() },
                    colors = ButtonDefaults.textButtonColors(contentColor = accentColor),
                ) { Text("Am înțeles") }
            } else {
                TextButton(
                    onClick = { viewModel.submitForgotPassword() },
                    enabled = uiState.forgotEmail.isNotBlank() && !uiState.forgotSubmitting,
                    colors = ButtonDefaults.textButtonColors(contentColor = accentColor),
                ) {
                    if (uiState.forgotSubmitting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text("Trimite")
                    }
                }
            }
        },
        dismissButton = if (sent) {
            null
        } else {
            {
                TextButton(onClick = { viewModel.dismissForgotDialog() }) { Text("Anulează") }
            }
        },
    )
}
