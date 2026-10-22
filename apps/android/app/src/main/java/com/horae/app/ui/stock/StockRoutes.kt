package com.horae.app.ui.stock

import com.horae.app.ui.navigation.Screen

/**
 * Stock / sales / transfer routes owned by the stock feature (registered in
 * [stockGraph]). Other features link here instead of hard-coding strings — e.g.
 * Profil › Setări opens [STOCK_REVIEW] (Revizie stocuri) and [SALES_DEDUCTIONS]
 * (Vânzări → stoc).
 */
object StockRoutes {
    /** "Revizie stocuri" — admin export of every stock row per lot. */
    val STOCK_REVIEW: String = Screen.StockReview.route

    /** "Vânzări → stoc" — sales-deduction sessions (feature-gated by the API). */
    val SALES_DEDUCTIONS: String = Screen.SalesDeductionList.route

    /** Stock movements journal. */
    val MOVEMENTS: String = Screen.StockMovementList.route

    /** Transfers journal / new transfer. */
    val TRANSFERS: String = Screen.TransferList.route
    val TRANSFER_CREATE: String = Screen.TransferCreate.route

    /** Recepție — intake (INTRARE with lot, expiry and price). */
    const val RECEIVE = "stock/receive?materialId={materialId}"

    /** Mișcare — manual INTRARE or AJUSTARE (the only manual types the API accepts). */
    const val MOVEMENT_NEW = "stock/movement-new?type={type}&materialId={materialId}"

    const val TEST_CONSUMPTION = "stock/test-consumption"
    const val EXPIRING = "stock/expiring"
    const val REQUIREMENTS = "stock/requirements"
    const val SUPPLIERS = "stock/suppliers"

    const val ARG_TYPE = "type"
    const val ARG_MATERIAL_ID = "materialId"

    fun receive(materialId: String? = null): String =
        if (materialId == null) "stock/receive" else "stock/receive?materialId=$materialId"

    /** [type] = "INTRARE" or "AJUSTARE". */
    fun movementNew(type: String? = null, materialId: String? = null): String {
        val params = listOfNotNull(type?.let { "type=$it" }, materialId?.let { "materialId=$it" })
        return if (params.isEmpty()) "stock/movement-new" else "stock/movement-new?" + params.joinToString("&")
    }
}
