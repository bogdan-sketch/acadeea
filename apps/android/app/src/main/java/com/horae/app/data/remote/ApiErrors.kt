package com.horae.app.data.remote

import com.horae.app.data.remote.interceptor.SessionRefreshUnavailableException
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import retrofit2.HttpException
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException

/**
 * Error body of `apps/api` (`HttpExceptionFilter`):
 * `{ statusCode, errorCode, message, ... }`.
 */
data class ApiError(
    val status: Int,
    val errorCode: String?,
    val message: String?,
)

/**
 * Central API error mapping — mirrors `packages/shared-types/src/error-codes.ts`
 * (Romanian user-facing copy; iOS has the same map in `APIError.swift`).
 * Add a new code here whenever one is added to shared-types.
 */
object ApiErrors {

    /** Romanian copy per backend errorCode. */
    val messages: Map<String, String> = mapOf(
        // Auth
        "AUTH_001" to "Email sau parolă greșită.",
        "AUTH_002" to "Sesiunea a expirat. Autentifică-te din nou.",
        "AUTH_003" to "Sesiunea a fost revocată. Autentifică-te din nou.",
        "AUTH_004" to "Nu ai permisiunea pentru această acțiune.",
        "ACCOUNT_LOCKED" to "Contul a fost blocat. Resetează-ți parola pentru a-l recupera.",
        "PASSWORD_REUSED" to "Nu poți refolosi o parolă recentă.",
        "ORGANIZATION_INACTIVE" to "Organizația este dezactivată.",
        // Stock
        "STOCK_001" to "Stoc insuficient.",
        "STOCK_002" to "Rezervarea stocului a eșuat.",
        "STOCK_003" to "Stocul a fost modificat între timp. Reîncearcă.",
        "STOCK_004" to "Subprodus invalid pentru rețeta produsă.",
        // Email
        "EMAIL_SEND_FAILED" to "Emailul nu a putut fi trimis.",
        // Sales deductions (scădere stoc din vânzări)
        "SALES_001" to "Ai vândut mai mult decât e în stoc. Confirmă scăderea până la 0 sau suprascrie stocul.",
        "SALES_002" to "Scăderea a fost deja confirmată sau anulată.",
        // Task
        "TASK_001" to "Tranziție de status invalidă.",
        "TASK_002" to "Sarcina este deja atribuită.",
        "TASK_003" to "O sarcină finalizată nu poate fi anulată.",
        "TASK_BLOCKED_INSUFFICIENT_STOCK" to "Sarcina nu poate porni — stoc insuficient (mutată în BLOCAT).",
        // Recipe
        "RECIPE_001" to "Dependență circulară între rețete.",
        "RECIPE_002" to "Rețeta are prea multe niveluri de semipreparate.",
        "RECIPE_003" to "Ingredient invalid.",
    )

    /**
     * Codes whose server `message` is MORE specific than the static copy
     * (e.g. SALES_001 lists the offending products) — show the server text.
     */
    private val preferServerMessage = setOf("SALES_001")

    fun parse(e: Throwable): ApiError? {
        if (e !is HttpException) return null
        return try {
            val body = e.response()?.errorBody()?.string()
            if (body.isNullOrBlank()) return ApiError(e.code(), null, null)
            val json = JSONObject(body)
            val message = when (val m = json.opt("message")) {
                is String -> m.takeIf { it.isNotBlank() }
                is JSONArray -> if (m.length() > 0) m.optString(0) else null
                else -> null
            }
            val code = json.optString("errorCode").takeIf { it.isNotBlank() }
                ?: json.optString("code").takeIf { it.isNotBlank() }
            ApiError(e.code(), code, message)
        } catch (_: Exception) {
            ApiError(e.code(), null, null)
        }
    }

    /** Shown when the network is down / unreachable. */
    const val OFFLINE_MESSAGE = "Nu există conexiune la internet. Încearcă din nou."
    const val TIMEOUT_MESSAGE = "Serverul răspunde greu. Încearcă din nou."
    const val SESSION_RETRY_MESSAGE = "Nu am putut reînnoi sesiunea acum. Încearcă din nou."
    const val THROTTLED_MESSAGE = "Prea multe cereri într-un timp scurt. Încearcă din nou în câteva secunde."
    const val SERVER_MESSAGE = "Serverul nu răspunde acum. Încearcă din nou."
    const val DEFAULT_MESSAGE = "A apărut o eroare. Încearcă din nou."

    /**
     * Best Romanian message for [e], or [fallback]. Never returns raw exception text
     * (no "HTTP 400" / "Unable to resolve host"). Don't show anything when
     * [isCancellation] is true.
     */
    fun userMessage(e: Throwable, fallback: String = DEFAULT_MESSAGE): String {
        when (e) {
            is SessionRefreshUnavailableException -> return when (e.httpCode) {
                429 -> THROTTLED_MESSAGE
                null -> OFFLINE_MESSAGE
                else -> SESSION_RETRY_MESSAGE
            }
            is SocketTimeoutException -> return TIMEOUT_MESSAGE
            is IOException -> return OFFLINE_MESSAGE
        }
        val err = parse(e) ?: return fallback
        val code = err.errorCode
        if (code != null && code in messages) {
            if (code in preferServerMessage && !err.message.isNullOrBlank()) return err.message
            return messages.getValue(code)
        }
        if (err.status == 429) return THROTTLED_MESSAGE
        if (err.status >= 500) return SERVER_MESSAGE
        return err.message?.takeIf { looksRomanianOrHuman(it) } ?: fallback
    }

    /** True for a cancelled call/coroutine (screen left, request superseded) — never show an error. */
    fun isCancellation(e: Throwable): Boolean {
        var t: Throwable? = e
        repeat(4) {
            when {
                t == null -> return false
                t is CancellationException -> return true
                t is InterruptedIOException && t !is SocketTimeoutException -> return true
                t is IOException && t.message.equals("Canceled", ignoreCase = true) -> return true
            }
            t = t?.cause
        }
        return false
    }

    /** Temporary failure worth an "Încearcă din nou": offline, timeout, refresh unavailable, 429, 5xx. */
    fun isRetryable(e: Throwable): Boolean = when {
        e is IOException -> true
        e is HttpException -> e.code() == 429 || e.code() >= 500
        else -> false
    }

    /** The server rejected the credentials (401/403) — the only case that ends a session. */
    fun isAuthRejection(e: Throwable): Boolean = e is HttpException && (e.code() == 401 || e.code() == 403)

    /** Server messages are Romanian; filter out framework English like "Bad Request" / "Internal server error". */
    private fun looksRomanianOrHuman(message: String): Boolean {
        val m = message.trim()
        if (m.isEmpty()) return false
        val englishDefaults = setOf("bad request", "unauthorized", "forbidden", "not found", "internal server error", "conflict", "too many requests")
        return m.lowercase() !in englishDefaults && !m.startsWith("HTTP ")
    }

    fun errorCode(e: Throwable): String? = parse(e)?.errorCode
}
