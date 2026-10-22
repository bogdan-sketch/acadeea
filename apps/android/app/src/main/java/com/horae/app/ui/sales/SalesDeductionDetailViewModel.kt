package com.horae.app.ui.sales

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.ConfirmSalesDeductionLineRequest
import com.horae.app.data.remote.dto.SalesDeductionDto
import com.horae.app.data.remote.dto.SalesDeductionLineDto
import com.horae.app.data.remote.dto.SalesMatchCandidateDto
import com.horae.app.data.remote.dto.SalesNewProductRequest
import com.horae.app.data.remote.dto.SalesProductOptionDto
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.data.repository.SalesDeductionRepository
import com.horae.app.domain.model.SalesDeductionDecision
import com.horae.app.domain.model.SalesDeductionSource
import com.horae.app.domain.model.SalesDeductionStatus
import com.horae.app.domain.model.UnitType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

// ── Editable row model (mirrors web stock/sales/[id]/page.tsx) ───────────

enum class StockMode { NORMAL, CLAMP, OVERRIDE }

data class SalesRow(
    val key: String,
    val id: String? = null,
    val rawName: String,
    val rawUnit: String? = null,
    val quantityReported: Double? = null,
    val matchKind: String? = null,
    val matchScore: Double? = null,
    val candidates: List<SalesMatchCandidateDto> = emptyList(),
    val decision: SalesDeductionDecision,
    val recipeId: String? = null,
    /** Signed: >0 scade, <0 adaugă înapoi. Text so "2," can be typed. */
    val qty: String,
    val stockMode: StockMode = StockMode.NORMAL,
    val override: String = "",
    val newName: String = "",
    val newUnit: UnitType = UnitType.BUCATI,
    val newCategory: String? = null,
    val newStock: String = "",
) {
    val isManual: Boolean get() = matchKind == "MANUAL"
}

private fun rowFromLine(l: SalesDeductionLineDto) = SalesRow(
    key = l.id,
    id = l.id,
    rawName = l.rawName,
    rawUnit = l.rawUnit,
    quantityReported = l.quantityReported,
    matchKind = l.matchKind,
    matchScore = l.matchScore,
    candidates = l.candidates,
    decision = SalesDeductionDecision.fromString(l.decision),
    recipeId = l.recipeId,
    qty = l.quantity?.let { numText(it) } ?: "",
    newName = l.rawName,
)

private fun manualRow() = SalesRow(
    key = UUID.randomUUID().toString(),
    rawName = "",
    matchKind = "MANUAL",
    decision = SalesDeductionDecision.ACCEPT,
    qty = "1",
)

data class RowComputed(
    val before: Double,
    val after: Double,
    val qty: Double?,
    val shortfall: Double,
    /** Shortfall without a clamp/override decision yet. */
    val unresolved: Boolean,
    val invalid: String?,
)

/** Stock preview, walking rows in order so the same product twice compounds. */
fun computeRows(
    rows: List<SalesRow>,
    products: Map<String, SalesProductOptionDto>,
): Map<String, RowComputed> {
    val running = mutableMapOf<String, Double>()
    val out = mutableMapOf<String, RowComputed>()
    for (r in rows) {
        val qty = toNum(r.qty)
        when (r.decision) {
            SalesDeductionDecision.DECLINE -> {
                out[r.key] = RowComputed(0.0, 0.0, qty, 0.0, false, null)
            }
            SalesDeductionDecision.CREATE_NEW -> {
                val stock = toNum(r.newStock)
                val invalid = when {
                    r.newName.isBlank() -> "Numele produsului nou"
                    stock == null || stock < 0 -> "Stocul actual al produsului nou"
                    else -> null
                }
                out[r.key] = RowComputed(0.0, stock ?: 0.0, qty, 0.0, false, invalid)
            }
            SalesDeductionDecision.ACCEPT -> {
                val product = r.recipeId?.let { products[it] }
                if (product == null) {
                    out[r.key] = RowComputed(0.0, 0.0, qty, 0.0, false, "Alege produsul")
                    continue
                }
                val before = running[product.id] ?: product.stock
                val override = toNum(r.override)
                val isOverride = r.stockMode == StockMode.OVERRIDE
                var invalid: String? = null
                if (qty == null && !isOverride) invalid = "Cantitatea"
                if (isOverride && (override == null || override < 0)) invalid = "Stocul suprascris"
                val q = qty ?: 0.0
                val after = if (isOverride && override != null) override else maxOf(0.0, round3(before - q))
                val shortfall = if (!isOverride && q > before) round3(q - before) else 0.0
                running[product.id] = after
                out[r.key] = RowComputed(
                    before = before,
                    after = after,
                    qty = qty,
                    shortfall = shortfall,
                    unresolved = shortfall > 0 && r.stockMode != StockMode.CLAMP,
                    invalid = invalid,
                )
            }
        }
    }
    return out
}

fun needsReview(r: SalesRow): Boolean {
    if (r.decision != SalesDeductionDecision.ACCEPT) {
        return r.decision == SalesDeductionDecision.CREATE_NEW && !r.isManual
    }
    if (r.recipeId == null) return true
    return r.matchKind == "FUZZY" || (r.matchKind == "CONTAINS" && (r.matchScore ?: 0.0) < 0.85)
}

enum class SalesFilter(val label: String) {
    ALL("Toate"),
    REVIEW("De verificat"),
    STOCK("Probleme stoc"),
    NEW("Produse noi"),
    DECLINED("Ignorate"),
}

data class SalesDetailUiState(
    val deduction: SalesDeductionDto? = null,
    val loadError: String? = null,
    val rows: List<SalesRow> = emptyList(),
    val products: List<SalesProductOptionDto> = emptyList(),
    val categories: List<String> = emptyList(),
    val filter: SalesFilter = SalesFilter.ALL,
    val showInvalid: Boolean = false,
    val confirmOpen: Boolean = false,
    val saving: Boolean = false,
    val discarding: Boolean = false,
    val reverting: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    /** Draft dropped — the screen pops back to the log. */
    val discarded: Boolean = false,
) {
    val productById: Map<String, SalesProductOptionDto> get() = products.associateBy { it.id }
}

@HiltViewModel
class SalesDeductionDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: SalesDeductionRepository,
    private val recipeRepository: RecipeRepository,
) : ViewModel() {

    private val id: String = savedStateHandle.get<String>("id").orEmpty()

    private val _uiState = MutableStateFlow(SalesDetailUiState())
    val uiState: StateFlow<SalesDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            try {
                val d = repository.get(id)
                setDeduction(d)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update {
                    it.copy(loadError = ApiErrors.userMessage(e, "Scăderea nu a fost găsită"))
                }
            }
        }
    }

    private fun setDeduction(d: SalesDeductionDto) {
        val isDraft = d.status == SalesDeductionStatus.DRAFT.name
        val lines = d.lines.orEmpty()
        val rows = when {
            !isDraft -> emptyList()
            // Manual sessions start with one empty row ready to fill.
            d.source == SalesDeductionSource.MANUAL.name && lines.isEmpty() -> listOf(manualRow())
            else -> lines.map(::rowFromLine)
        }
        _uiState.update { it.copy(deduction = d, rows = rows, loadError = null) }
        if (isDraft) loadPickerData(d.locationId)
    }

    private fun loadPickerData(locationId: String) {
        viewModelScope.launch {
            try {
                val products = repository.products(locationId)
                _uiState.update { it.copy(products = products) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update { it.copy(error = "Nu am putut încărca produsele") }
            }
        }
        viewModelScope.launch {
            try {
                val cats = recipeRepository.getCategories("PRODUS_FINIT")
                _uiState.update { it.copy(categories = cats) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                // optional — the new product just lands in "Misc"
            }
        }
    }

    // ── Row edits ──

    fun updateRow(key: String, f: (SalesRow) -> SalesRow) =
        _uiState.update { s -> s.copy(rows = s.rows.map { if (it.key == key) f(it) else it }) }

    fun removeRow(key: String) = _uiState.update { s -> s.copy(rows = s.rows.filterNot { it.key == key }) }

    fun addManualRow() = _uiState.update { it.copy(rows = it.rows + manualRow(), filter = SalesFilter.ALL) }

    fun setFilter(f: SalesFilter) = _uiState.update { it.copy(filter = f) }

    fun dismissError() = _uiState.update { it.copy(error = null) }
    fun consumeMessage() = _uiState.update { it.copy(message = null) }

    // ── Confirm ──

    fun openConfirm() {
        val s = _uiState.value
        if (s.rows.isEmpty()) {
            _uiState.update { it.copy(error = "Nu există niciun produs de confirmat") }
            return
        }
        val computed = computeRows(s.rows, s.productById)
        val invalid = computed.values.count { it.invalid != null }
        if (invalid > 0) {
            _uiState.update {
                it.copy(
                    showInvalid = true,
                    filter = SalesFilter.REVIEW,
                    error = "$invalid ${if (invalid == 1) "rând are" else "rânduri au"} date lipsă",
                )
            }
            return
        }
        _uiState.update { it.copy(confirmOpen = true) }
    }

    fun closeConfirm() {
        if (_uiState.value.saving) return
        _uiState.update { it.copy(confirmOpen = false) }
    }

    fun submit(note: String, ackAll: Boolean) {
        val s = _uiState.value
        val d = s.deduction ?: return
        val products = s.productById
        val computed = computeRows(s.rows, products)
        val nameOf = { r: SalesRow -> r.recipeId?.let { products[it]?.name } ?: r.rawName.ifBlank { "Produs" } }

        val lines = s.rows.map { r ->
            val c = computed[r.key]
            val rawName = r.rawName.trim().ifBlank { nameOf(r) }
            when (r.decision) {
                SalesDeductionDecision.CREATE_NEW -> ConfirmSalesDeductionLineRequest(
                    id = r.id,
                    rawName = rawName,
                    decision = r.decision.name,
                    newProduct = SalesNewProductRequest(
                        name = r.newName.trim(),
                        unit = r.newUnit.name,
                        category = r.newCategory,
                        initialStock = toNum(r.newStock) ?: 0.0,
                    ),
                )
                SalesDeductionDecision.DECLINE -> ConfirmSalesDeductionLineRequest(
                    id = r.id,
                    rawName = rawName,
                    decision = r.decision.name,
                    recipeId = r.recipeId,
                )
                SalesDeductionDecision.ACCEPT -> ConfirmSalesDeductionLineRequest(
                    id = r.id,
                    rawName = rawName,
                    decision = r.decision.name,
                    recipeId = r.recipeId,
                    quantity = c?.qty ?: 0.0,
                    stockOverride = if (r.stockMode == StockMode.OVERRIDE) toNum(r.override) ?: 0.0 else null,
                    acceptShortfall = if (r.stockMode == StockMode.CLAMP || (ackAll && c?.unresolved == true)) true else null,
                )
            }
        }

        if (ackAll) {
            // Reflect the bulk acknowledgement locally too (as web does).
            _uiState.update { st ->
                st.copy(rows = st.rows.map { r -> if (computed[r.key]?.unresolved == true) r.copy(stockMode = StockMode.CLAMP) else r })
            }
        }

        _uiState.update { it.copy(saving = true) }
        viewModelScope.launch {
            try {
                val res = repository.confirm(d.id, lines, note.trim().ifBlank { null })
                _uiState.update {
                    it.copy(
                        saving = false,
                        confirmOpen = false,
                        message = "Stocul a fost actualizat — ${res.summary.accepted} scăzute · " +
                            "${res.summary.created} noi · ${res.summary.declined} ignorate",
                    )
                }
                setDeduction(res)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update {
                    it.copy(saving = false, error = ApiErrors.userMessage(e, "Confirmarea a eșuat"))
                }
                // Already confirmed/cancelled elsewhere → show its current (read-only) state.
                if (ApiErrors.errorCode(e) == "SALES_002") {
                    _uiState.update { it.copy(confirmOpen = false) }
                    load()
                }
            }
        }
    }

    // ── Discard / revert ──

    fun discard() {
        val d = _uiState.value.deduction ?: return
        _uiState.update { it.copy(discarding = true) }
        viewModelScope.launch {
            try {
                repository.discard(d.id)
                _uiState.update { it.copy(discarding = false, discarded = true) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update { it.copy(discarding = false, error = ApiErrors.userMessage(e, "Eroare")) }
            }
        }
    }

    fun revert(onDone: () -> Unit) {
        val d = _uiState.value.deduction ?: return
        _uiState.update { it.copy(reverting = true) }
        viewModelScope.launch {
            try {
                val res = repository.revert(d.id)
                _uiState.update {
                    it.copy(reverting = false, message = "Scăderea a fost anulată — stocul a fost pus la loc")
                }
                setDeduction(res)
                onDone()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update { it.copy(reverting = false, error = ApiErrors.userMessage(e, "Anularea a eșuat")) }
            }
        }
    }
}
