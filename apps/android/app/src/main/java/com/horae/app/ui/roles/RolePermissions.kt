package com.horae.app.ui.roles

/**
 * Shared permission metadata for the roles UI.
 * Labels are copied verbatim from the web roles page (the canonical UX).
 */

/** Romanian labels for each CASL subject the backend exposes. */
val SUBJECT_LABELS: Map<String, String> = mapOf(
    "Recipe" to "Rețete",
    "RecipeCost" to "Cost producție rețete",
    "Task" to "Task-uri",
    "Order" to "Comenzi",
    "OrderItem" to "Articole comandă",
    "RawMaterial" to "Materii prime",
    "Consumable" to "Consumabile",
    "StockMovement" to "Mișcări stoc",
    "StockReservation" to "Rezervări stoc",
    "Location" to "Locații",
    "StockTransfer" to "Transferuri stoc",
    "User" to "Utilizatori",
    "UserInvitation" to "Invitații",
    "DeliveryNote" to "Avize livrare",
    "Organization" to "Organizație",
    "Role" to "Roluri",
)

val ACTION_LABELS: Map<String, String> = mapOf(
    "read" to "Vede",
    "create" to "Adaugă",
    "update" to "Modifică",
    "delete" to "Șterge",
)

val ACTION_ORDER: List<String> = listOf("read", "create", "update", "delete")

/**
 * Friendly access-level preset over the raw action set.
 * CUSTOM is derived, never picked directly.
 */
enum class AccessPreset(val label: String, val actions: Set<String>?) {
    NONE("Fără acces", emptySet()),
    VIEW("Vizualizare", setOf("read")),
    EDIT("Editare", setOf("read", "create", "update")),
    FULL("Gestionare completă", setOf("read", "create", "update", "delete")),
    CUSTOM("Personalizat", null);

    companion object {
        /** Presets the dropdown offers. */
        val presets: List<AccessPreset> = listOf(NONE, VIEW, EDIT, FULL)

        /** Derive the preset that matches a set of actions (or CUSTOM if none fits). */
        fun of(actions: Set<String>): AccessPreset =
            presets.firstOrNull { it.actions == actions } ?: CUSTOM
    }
}
