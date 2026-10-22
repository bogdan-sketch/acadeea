package com.horae.app.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.horae.app.domain.model.User
import com.horae.app.domain.model.UserRole
import dagger.hilt.android.qualifiers.ApplicationContext
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Securely stores the JWT tokens and the last signed-in [User] (EncryptedSharedPreferences,
 * AES256). The cached user lets an OFFLINE cold start open the app with the saved session
 * instead of the login form; it is replaced on every successful login / `/auth/me` and
 * wiped with the tokens.
 */
@Singleton
class TokenManager @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs: SharedPreferences

    init {
        prefs = openSecurePrefs(context)
        Timber.d("TokenManager: initialized, hasTokens=$hasTokens")
    }

    var accessToken: String?
        get() = prefs.getString(KEY_ACCESS_TOKEN, null)
        set(value) {
            prefs.edit().putString(KEY_ACCESS_TOKEN, value).apply()
        }

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH_TOKEN, null)
        set(value) {
            prefs.edit().putString(KEY_REFRESH_TOKEN, value).apply()
        }

    /** Store both tokens in one write (refresh rotates them together). */
    fun saveTokens(access: String, refresh: String) {
        prefs.edit().putString(KEY_ACCESS_TOKEN, access).putString(KEY_REFRESH_TOKEN, refresh).commit()
    }

    val hasTokens: Boolean
        get() = !accessToken.isNullOrBlank() && !refreshToken.isNullOrBlank()

    /** Last user seen online, for offline restore. */
    var cachedUser: User?
        get() = prefs.getString(KEY_USER, null)?.let(::decodeUser)
        set(value) {
            prefs.edit().apply { if (value == null) remove(KEY_USER) else putString(KEY_USER, encodeUser(value)) }.apply()
        }

    fun clearTokens() {
        prefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_USER)
            .commit()
        Timber.d("TokenManager: tokens cleared")
    }

    private fun encodeUser(u: User): String = JSONObject().apply {
        put("id", u.id); put("email", u.email); put("firstName", u.firstName); put("lastName", u.lastName)
        put("role", u.role.name); put("roleSlug", u.roleSlug); put("roleName", u.roleName)
        // Avatars can be large data URIs — keep only URLs in the encrypted prefs.
        put("avatarUrl", u.avatarUrl?.takeUnless { it.startsWith("data:") })
    }.toString()

    private fun decodeUser(json: String): User? = runCatching {
        val o = JSONObject(json)
        fun str(k: String) = o.optString(k).takeIf { o.has(k) && !o.isNull(k) && it.isNotEmpty() }
        User(
            id = o.getString("id"),
            email = o.optString("email"),
            firstName = o.optString("firstName"),
            lastName = o.optString("lastName"),
            role = UserRole.fromString(o.optString("role")),
            roleSlug = str("roleSlug"),
            roleName = str("roleName"),
            avatarUrl = str("avatarUrl"),
        )
    }.getOrNull()

    companion object {
        private const val PREFS_FILE_NAME = "acadeea_secure_prefs"
        private const val FALLBACK_PREFS_FILE_NAME = "acadeea_session_fallback"

        /**
         * Opens the encrypted store without ever crashing the app at launch. The usual failure is
         * a store restored from a backup / device transfer whose Keystore key did not travel with
         * it (AEADBadTagException, InvalidProtocolBufferException…): the file is wiped and
         * recreated — the user just logs in again. If the Keystore itself is broken (some older
         * Huawei / Xiaomi / Samsung builds), fall back to private app-only preferences so the
         * app still starts.
         */
        internal fun openSecurePrefs(
            context: Context,
            create: (Context) -> SharedPreferences = ::createEncryptedPrefs,
        ): SharedPreferences {
            try {
                return create(context)
            } catch (e: Exception) {
                Timber.w(e, "TokenManager: secure store unreadable, resetting it")
            }
            context.deleteSharedPreferences(PREFS_FILE_NAME)
            try {
                return create(context)
            } catch (e: Exception) {
                Timber.e(e, "TokenManager: Keystore unusable, using app-private preferences")
            }
            return context.getSharedPreferences(FALLBACK_PREFS_FILE_NAME, Context.MODE_PRIVATE)
        }

        private fun createEncryptedPrefs(context: Context): SharedPreferences {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            return EncryptedSharedPreferences.create(
                context,
                PREFS_FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER = "cached_user"
    }
}
