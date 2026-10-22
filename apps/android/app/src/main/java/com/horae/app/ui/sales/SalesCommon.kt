package com.horae.app.ui.sales

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.horae.app.data.repository.SalesDeductionRepository
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.SalesDeductionStatus
import com.horae.app.domain.model.UnitType
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.theme.Error
import com.horae.app.ui.theme.Info
import com.horae.app.ui.theme.Success
import com.horae.app.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

// Labels mirror apps/web/src/app/(dashboard)/stock/sales/labels.ts.

internal val SalesGray = Color(0xFF8E8E93)

internal fun statusColor(status: SalesDeductionStatus?): Color = when (status) {
    SalesDeductionStatus.DRAFT -> Warning
    SalesDeductionStatus.CONFIRMED -> Success
    else -> SalesGray
}

/** Cât de sigură e potrivirea numelui din raport cu produsul din aplicație. */
internal fun matchBadge(kind: String?, score: Double?): Pair<String, Color> = when (kind) {
    "ALIAS" -> "Învățat" to Success
    "MAPPING" -> "Mapat site" to Success
    "MANUAL" -> "Manual" to Info
    "NONE", null -> "Negăsit" to Error
    else -> if ((score ?: 0.0) >= 0.85) "Sigur" to Success else "De verificat" to Warning
}

/** Units offered when creating a product from the report (same subset as web). */
internal val newProductUnits = listOf(UnitType.BUCATI, UnitType.KILOGRAME, UnitType.GRAME, UnitType.LITRI)

internal fun unitLabel(unit: String?): String =
    UnitType.entries.firstOrNull { it.name == unit }?.abbreviation ?: (unit ?: "")

/** RO keyboards type decimals with a comma. */
internal fun toNum(s: String): Double? {
    val t = s.trim().replace(',', '.')
    if (t.isEmpty() || t == "-") return null
    return t.toDoubleOrNull()?.takeIf { it.isFinite() }
}

internal fun round3(n: Double): Double = Math.round(n * 1000.0) / 1000.0

internal fun numText(n: Double): String {
    val r = round3(n)
    val s = if (r == Math.floor(r)) r.toLong().toString() else r.toString()
    return s.replace('.', ',')
}


/** "17 oct. 2026, 09:30" in Europe/Bucharest. */
internal fun fmtDateTime(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    return com.horae.app.ui.common.RoDate.shortDateTime(iso).ifBlank { iso }
}

/** Same UX gate as web: read StockMovement shows the log, create StockMovement writes. */
internal fun canReadSales(role: UserRole) =
    PermissionManager.can(role, CASLAction.READ, CASLSubject.STOCK_MOVEMENT)

internal fun canWriteSales(role: UserRole) =
    PermissionManager.can(role, CASLAction.CREATE, CASLSubject.STOCK_MOVEMENT)

// ---------------------------------------------------------------------------
// Feature gate — `GET /sales-deductions/feature` (test environment only today)
// ---------------------------------------------------------------------------

@HiltViewModel
class SalesFeatureViewModel @Inject constructor(
    private val repository: SalesDeductionRepository,
) : ViewModel() {
    private val _enabled = MutableStateFlow(false)
    val enabled: StateFlow<Boolean> = _enabled.asStateFlow()

    init {
        viewModelScope.launch { _enabled.value = repository.isFeatureEnabled() }
    }
}

/** True once the API reports the sales-deductions feature as enabled. */
@Composable
fun rememberSalesFeatureEnabled(): Boolean {
    val vm: SalesFeatureViewModel = hiltViewModel()
    val enabled by vm.enabled.collectAsState()
    return enabled
}
