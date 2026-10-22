package com.horae.app.domain.model

/**
 * Mirrors the API enums (`apps/api/src/prisma/schema.prisma`, `packages/shared-types`)
 * and iOS `Core/Theme/Enums.swift`. Values must match the backend exactly.
 *
 * Rules:
 * - `displayName` is THE Romanian label (with diacritics) — never build another label map.
 * - Statuses carry ONE `kind` ([StatusKind]) mapping; colours come from
 *   `ui/theme/StatusPalette` (`StatusPalette.fg(kind)` / `HoraeTheme.status`). A null kind = neutral.
 * - Parse API strings with `fromString` (null / fallback when unknown — never crash on a new value).
 */

/** Semantic colour family of a status. Resolved by `ui/theme/StatusPalette`. */
enum class StatusKind { NEW, IN_PROGRESS, READY, WARNING, DANGER }

enum class UserRole(val displayName: String) {
    ADMINISTRATOR("Administrator"),
    SEF_LABORATOR("Șef laborator"),
    SEF_EVENIMENTE("Șef evenimente"),
    COFETAR("Cofetar"),
    PATISER("Patiser"),
    AJUTOR_COFETAR("Ajutor cofetar"),
    MAGAZIONER("Magazioner");

    companion object {
        /** Accepts the legacy names (ADMINISTRATOR) and the per-tenant dynamic slugs
         *  (administrator, sef-cofetar, gestionar…), mapped to the closest legacy role;
         *  unknown = least privileged. For DISPLAY prefer the API role name (`User.roleLabel`). */
        fun fromString(value: String): UserRole {
            val norm = value.trim().uppercase().replace('-', '_')
            entries.firstOrNull { it.name == norm }?.let { return it }
            return when (norm) {
                "SEF_COFETAR" -> SEF_LABORATOR
                "GESTIONAR" -> MAGAZIONER
                else -> AJUTOR_COFETAR
            }
        }
    }
}

enum class TaskStatus(val displayName: String) {
    DE_FACUT("De făcut"),
    /** Start failed for lack of stock (API moves the task here). */
    BLOCAT("Blocat"),
    IN_LUCRU("În lucru"),
    FINALIZAT("Finalizat"),
    ANULAT("Anulat");

    val kind: StatusKind?
        get() = when (this) {
            DE_FACUT -> null
            BLOCAT -> StatusKind.WARNING
            IN_LUCRU -> StatusKind.IN_PROGRESS
            FINALIZAT -> StatusKind.READY
            ANULAT -> StatusKind.DANGER
        }

    /** Valid transitions from this status (API `tasks.service.ts`). */
    val allowedTransitions: List<TaskStatus>
        get() = when (this) {
            DE_FACUT -> listOf(IN_LUCRU, ANULAT)
            BLOCAT -> listOf(IN_LUCRU, DE_FACUT, ANULAT)
            IN_LUCRU -> listOf(FINALIZAT, ANULAT)
            FINALIZAT -> emptyList()
            ANULAT -> emptyList()
        }

    /** Finished tasks are read-only. */
    val isClosed: Boolean get() = this == FINALIZAT || this == ANULAT

    companion object {
        fun fromString(value: String?): TaskStatus? = entries.firstOrNull { it.name == value }
    }
}

enum class TaskVisibility(val displayName: String) {
    ASSIGNED("Doar cine e asignat"),
    EVERYONE("Toată lumea"),
    SELECTED("Anumite persoane");

    companion object {
        fun fromString(value: String?): TaskVisibility? = entries.firstOrNull { it.name == value }
    }
}

enum class StockMovementType(val displayName: String) {
    INTRARE("Intrare"),
    IESIRE_PRODUCTIE("Ieșire producție"),
    INTRARE_PRODUCTIE("Intrare din producție"),
    AJUSTARE("Ajustare"),
    REZERVARE("Rezervare"),
    ELIBERARE("Eliberare"),
    IESIRE_TESTE("Consum teste"),
    IESIRE_VANZARE("Vânzare");

    companion object {
        /** Only these can be created manually (API `stock.service.ts`). */
        val manualTypes: List<StockMovementType> = listOf(INTRARE, AJUSTARE)

        fun fromString(value: String?): StockMovementType? = entries.firstOrNull { it.name == value }

        /** Label for a raw API value, the raw value when unknown. */
        fun label(value: String?): String = fromString(value)?.displayName ?: value.orEmpty()
    }
}

enum class RecipeType(val displayName: String) {
    FINAL("Final"),
    SEMIPREPARAT("Semipreparat");

    companion object {
        fun fromString(value: String?): RecipeType? = entries.firstOrNull { it.name == value }
    }
}

/**
 * Units. Display: `ui/common/QuantityFormat.kt` `formatQty(value, unit)` (humanized,
 * zero stays in the item's unit). New input offers only [metricInputUnits];
 * oz/lb/cups/spoons exist only to DISPLAY stored legacy values.
 */
enum class UnitType(val displayName: String, val abbreviation: String) {
    MILIGRAME("Miligrame", "mg"),
    GRAME("Grame", "g"),
    KILOGRAME("Kilograme", "kg"),
    MILILITRI("Mililitri", "ml"),
    LITRI("Litri", "l"),
    BUCATI("Bucăți", "buc"),
    LINGURITE("Lingurițe", "linguriță"),
    LINGURI("Linguri", "lingură"),
    CANI("Căni", "cană"),
    OUNCES("Uncii", "oz"),
    POUNDS("Livre", "lbs");

    /** Imperial / kitchen units kept only for stored legacy values. */
    val isLegacy: Boolean get() = this in setOf(LINGURITE, LINGURI, CANI, OUNCES, POUNDS)

    companion object {
        fun fromString(value: String?): UnitType? = entries.firstOrNull { it.name == value }

        /** Units offered for NEW input (metric + pieces). */
        val metricInputUnits: List<UnitType> = listOf(GRAME, KILOGRAME, MILILITRI, LITRI, BUCATI)
    }
}

enum class MaterialStatus(val displayName: String) {
    ACTIVE("Activ"),
    LOW_STOCK("Stoc scăzut"),
    OUT_OF_STOCK("Fără stoc"),
    DISCONTINUED("Întrerupt");

    val kind: StatusKind?
        get() = when (this) {
            ACTIVE -> StatusKind.READY
            LOW_STOCK -> StatusKind.WARNING
            OUT_OF_STOCK -> StatusKind.DANGER
            DISCONTINUED -> null
        }

    companion object {
        fun fromString(value: String?): MaterialStatus? = entries.firstOrNull { it.name == value }
    }
}

enum class StorageType(val displayName: String) {
    COLD("Frigider"),
    WARM("Temperatură ambientală"),
    FROZEN("Congelator");

    companion object {
        fun fromString(value: String?): StorageType? = entries.firstOrNull { it.name == value }
    }
}

enum class PieceType(val displayName: String) {
    SAC("Sac"),
    CUTIE("Cutie"),
    BIDON("Bidon"),
    PUNGA("Pungă"),
    RECIPIENT("Recipient"),
    BUCATA("Bucată");

    companion object {
        fun fromString(value: String?): PieceType? = entries.firstOrNull { it.name == value }
    }
}

enum class TaskPriority(val displayName: String) {
    LOW("Scăzută"),
    MEDIUM("Medie"),
    HIGH("Ridicată"),
    URGENT("Urgentă");
}

enum class OrderStatus(val displayName: String) {
    NOUA("Nouă"),
    IN_PREGATIRE("În pregătire"),
    PREGATITA("Pregătită"),
    IN_TRANZIT("În tranzit"),
    LIVRATA("Livrată"),
    ANULATA("Anulată");

    val kind: StatusKind
        get() = when (this) {
            NOUA -> StatusKind.NEW
            IN_PREGATIRE, IN_TRANZIT -> StatusKind.IN_PROGRESS
            PREGATITA, LIVRATA -> StatusKind.READY
            ANULATA -> StatusKind.DANGER
        }

    val allowedTransitions: List<OrderStatus>
        get() = when (this) {
            NOUA -> listOf(IN_PREGATIRE, ANULATA)
            IN_PREGATIRE -> listOf(PREGATITA, ANULATA)
            PREGATITA -> listOf(IN_TRANZIT, ANULATA)
            IN_TRANZIT -> listOf(LIVRATA)
            LIVRATA -> emptyList()
            ANULATA -> emptyList()
        }

    val isOpen: Boolean get() = this != LIVRATA && this != ANULATA

    companion object {
        fun fromString(value: String?): OrderStatus? = entries.firstOrNull { it.name == value }
    }
}

enum class OrderItemStatus(val displayName: String) {
    IN_PREGATIRE("În pregătire"),
    GATA("Gata"),
    IN_TRANZIT("În tranzit"),
    LIVRAT("Livrat");

    val kind: StatusKind
        get() = when (this) {
            IN_PREGATIRE, IN_TRANZIT -> StatusKind.IN_PROGRESS
            GATA, LIVRAT -> StatusKind.READY
        }

    companion object {
        fun fromString(value: String?): OrderItemStatus? = entries.firstOrNull { it.name == value }
    }
}

/** API `OrderFulfillmentType`. */
enum class FulfillmentType(val displayName: String) {
    DELIVERY("Livrare"),
    PICKUP("Ridicare");

    companion object {
        fun fromString(value: String?): FulfillmentType? = entries.firstOrNull { it.name == value }
    }
}

enum class LocationType(val displayName: String) {
    DEPOZIT("Depozit"),
    FRIGIDER("Frigider"),
    CONGELATOR("Congelator"),
    LABORATOR("Laborator"),
    MAGAZIN("Magazin"),
    PUNCT_LUCRU("Punct de lucru");

    companion object {
        fun fromString(value: String?): LocationType? = entries.firstOrNull { it.name == value }
    }
}

/** Stock-transfer lifecycle. Mirrors backend `TransferStatus`. */
enum class TransferStatus(val displayName: String) {
    IN_ASTEPTARE("În așteptare"),
    IN_TRANZIT("În tranzit"),
    FINALIZAT("Finalizat"),
    ANULAT("Anulat");

    val kind: StatusKind
        get() = when (this) {
            IN_ASTEPTARE -> StatusKind.WARNING
            IN_TRANZIT -> StatusKind.IN_PROGRESS
            FINALIZAT -> StatusKind.READY
            ANULAT -> StatusKind.DANGER
        }

    /** Valid status transitions via `PATCH /stock/transfers/:id`. */
    val allowedTransitions: List<TransferStatus>
        get() = when (this) {
            IN_ASTEPTARE -> listOf(IN_TRANZIT, ANULAT)
            IN_TRANZIT -> listOf(FINALIZAT, ANULAT)
            FINALIZAT -> emptyList()
            ANULAT -> emptyList()
        }

    companion object {
        fun fromString(value: String?): TransferStatus? =
            entries.firstOrNull { it.name == value }
    }
}

/** API `TransferApprovalStatus`. */
enum class TransferApprovalStatus(val displayName: String) {
    PENDING("În așteptare"),
    APPROVED("Aprobat"),
    REJECTED("Respins");

    val kind: StatusKind
        get() = when (this) {
            PENDING -> StatusKind.WARNING
            APPROVED -> StatusKind.READY
            REJECTED -> StatusKind.DANGER
        }

    companion object {
        fun fromString(value: String?): TransferApprovalStatus? = entries.firstOrNull { it.name == value }
    }
}

/** Approval verdicts sent to `PATCH /stock/transfers/:id/approval`. */
object TransferApproval {
    const val APPROVED = "APPROVED"
    const val REJECTED = "REJECTED"
}

enum class EquipmentStatus(val displayName: String) {
    DISPONIBIL("Disponibil"),
    IN_UTILIZARE("În utilizare"),
    IN_MENTENANTA("În mentenanță"),
    DEFECT("Defect"),
    SCOS_DIN_UZ("Scos din uz");

    val kind: StatusKind?
        get() = when (this) {
            DISPONIBIL -> StatusKind.READY
            IN_UTILIZARE -> StatusKind.IN_PROGRESS
            IN_MENTENANTA -> StatusKind.WARNING
            DEFECT -> StatusKind.DANGER
            SCOS_DIN_UZ -> null
        }

    companion object {
        fun fromString(value: String?): EquipmentStatus? = entries.firstOrNull { it.name == value }
    }
}

enum class IntegrationSyncStatus(val displayName: String) {
    PENDING("În așteptare"),
    SYNCED("Sincronizat"),
    FAILED("Eșuat"),
    SKIPPED("Omis");

    val kind: StatusKind?
        get() = when (this) {
            PENDING -> StatusKind.WARNING
            SYNCED -> StatusKind.READY
            FAILED -> StatusKind.DANGER
            SKIPPED -> null
        }

    companion object {
        fun fromString(value: String?): IntegrationSyncStatus? = entries.firstOrNull { it.name == value }
    }
}

/** EU allergens (Reg. 1169/2011), labels as iOS/web. */
enum class Allergen(val displayName: String) {
    GLUTEN("Gluten"),
    CRUSTACEE("Crustacee"),
    OUA("Ouă"),
    PESTE("Pește"),
    ARAHIDE("Arahide"),
    SOIA("Soia"),
    LAPTE("Lapte (lactoză)"),
    NUCI("Fructe cu coajă (nuci)"),
    TELINA("Țelină"),
    MUSTAR("Muștar"),
    SUSAN("Susan"),
    SULFITI("Dioxid de sulf / sulfiți"),
    LUPIN("Lupin"),
    MOLUSTE("Moluște");

    companion object {
        fun fromString(value: String?): Allergen? = entries.firstOrNull { it.name == value }
    }
}

// ── Scădere stoc din vânzări (sales → stock deductions) ──────────────────
// Mirrors backend `SalesDeductionSource` / `SalesDeductionStatus` / `SalesDeductionDecision`.

enum class SalesDeductionSource(val displayName: String) {
    EXCEL("Raport Excel"),
    MANUAL("Manual"),
    WOOCOMMERCE("Site (WooCommerce)");

    companion object {
        fun fromString(value: String?): SalesDeductionSource? = entries.firstOrNull { it.name == value }
    }
}

enum class SalesDeductionStatus(val displayName: String) {
    DRAFT("Neconfirmată"),
    CONFIRMED("Confirmată"),
    ANULAT("Anulată");

    val kind: StatusKind?
        get() = when (this) {
            DRAFT -> StatusKind.WARNING
            CONFIRMED -> StatusKind.READY
            ANULAT -> null
        }

    companion object {
        fun fromString(value: String?): SalesDeductionStatus? = entries.firstOrNull { it.name == value }
    }
}

enum class SalesDeductionDecision(val displayName: String) {
    ACCEPT("Scade"),
    CREATE_NEW("Produs nou"),
    DECLINE("Ignoră");

    companion object {
        fun fromString(value: String?): SalesDeductionDecision =
            entries.firstOrNull { it.name == value } ?: ACCEPT
    }
}
