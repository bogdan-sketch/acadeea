import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

// Observability secrets are read from the git-ignored local.properties (real keys),
// with a fallback to gradle/project properties. Missing => empty => SDK disabled at runtime.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun obsProp(name: String): String =
    (localProps.getProperty(name) ?: (project.findProperty(name) as String?)).orEmpty()

android {
    namespace = "com.horae.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "ro.acadeea.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 2
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Observability config — read from the git-ignored local.properties (or gradle/project
        // properties), never hardcoded. Missing/empty => the corresponding SDK init is skipped at
        // runtime (no-op). See apps/android/CLAUDE.md "Observability" for the property names.
        val sentryDsn = obsProp("SENTRY_DSN")
        val posthogKey = obsProp("POSTHOG_KEY")
        val posthogHost = obsProp("POSTHOG_HOST").ifBlank { "https://eu.i.posthog.com" }
        buildConfigField("String", "SENTRY_DSN", "\"$sentryDsn\"")
        buildConfigField("String", "POSTHOG_KEY", "\"$posthogKey\"")
        buildConfigField("String", "POSTHOG_HOST", "\"$posthogHost\"")
    }

    // Acadeea on-prem: ONE app (ro.acadeea.app) on api.acadeea.ro — no test env.
    // A single flavor is kept so BuildConfig.FLAVOR ("prod") still exists.
    flavorDimensions += "env"
    productFlavors {
        create("prod") {
            dimension = "env"
            isDefault = true
            buildConfigField("String", "BASE_URL", "\"https://api.acadeea.ro\"")
            buildConfigField("String", "BRAND_NAME", "\"Acadeea\"")
            buildConfigField("String", "ORG_SLUG", "\"acadeea\"")
            resValue("string", "app_name", "Acadeea")
        }
    }

    // Release signing: local.properties `SIGNING_PROPERTIES=/abs/path/keystore.properties`
    // (storeFile/storePassword/keyAlias/keyPassword). The keystore is NEVER in git —
    // without it the release build is simply unsigned.
    val signingProps = obsProp("SIGNING_PROPERTIES").takeIf { it.isNotBlank() }
        ?.let { file(it) }?.takeIf { it.exists() }
        ?.let { f -> Properties().apply { f.inputStream().use { load(it) } } }
    signingConfigs {
        if (signingProps != null) {
            create("release") {
                storeFile = file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            if (signingProps != null) signingConfig = signingConfigs.getByName("release")
            // R8 was never exercised on this app (Moshi/Retrofit/Tink keep rules missing) —
            // ship the same unminified code as debug until it is.
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        // android.* stubs return defaults instead of throwing in JVM unit tests.
        unitTests.isReturnDefaultValues = true
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    // AndroidX Core
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    debugImplementation(libs.androidx.ui.tooling)

    // Navigation
    implementation(libs.androidx.navigation.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.android.compiler)
    implementation(libs.androidx.hilt.navigation.compose)

    // Networking
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.moshi)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.moshi)
    implementation(libs.moshi.kotlin)
    ksp(libs.moshi.kotlin.codegen)

    // Security
    implementation(libs.androidx.security.crypto)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)

    // Logging
    implementation(libs.timber)

    // Images (avatars, org logos)
    implementation(libs.coil.compose)

    // Observability (errors/crash/perf + product analytics)
    implementation(libs.sentry.android)
    implementation(libs.posthog.android)

    // JVM unit tests (formatters, enums, interceptor, view models) — no emulator.
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.truth)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.org.json)
}
