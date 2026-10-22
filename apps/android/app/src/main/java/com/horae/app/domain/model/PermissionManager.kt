package com.horae.app.domain.model

/**
 * Mirrors CASL ability rules from casl-ability.factory.ts.
 * Source: apps/api/src/modules/auth/casl/casl-ability.factory.ts
 */

enum class CASLAction {
    MANAGE, CREATE, READ, UPDATE, DELETE
}

enum class CASLSubject {
    ALL,
    USER, RAW_MATERIAL, CONSUMABLE, RECIPE,
    TASK, STOCK_MOVEMENT, STOCK_RESERVATION,
    ORDER, ORDER_ITEM, DELIVERY_NOTE,
    STOCK_TRANSFER
}

private data class Rule(val action: CASLAction, val subject: CASLSubject)

object PermissionManager {

    fun can(role: UserRole, action: CASLAction, subject: CASLSubject): Boolean {
        val rules = rulesForRole(role)

        // "manage all" short-circuit
        if (rules.any { it.action == CASLAction.MANAGE && it.subject == CASLSubject.ALL }) {
            return true
        }

        // "manage <subject>" grants all actions on that subject
        if (rules.any { it.action == CASLAction.MANAGE && it.subject == subject }) {
            return true
        }

        return rules.any { it.action == action && it.subject == subject }
    }

    private fun rulesForRole(role: UserRole): List<Rule> = when (role) {
        UserRole.ADMINISTRATOR -> listOf(
            Rule(CASLAction.MANAGE, CASLSubject.ALL)
        )

        UserRole.SEF_LABORATOR -> listOf(
            Rule(CASLAction.READ, CASLSubject.RECIPE),
            Rule(CASLAction.CREATE, CASLSubject.RECIPE),
            Rule(CASLAction.UPDATE, CASLSubject.RECIPE),
            Rule(CASLAction.READ, CASLSubject.RAW_MATERIAL),
            Rule(CASLAction.READ, CASLSubject.CONSUMABLE),
            Rule(CASLAction.READ, CASLSubject.TASK),
            Rule(CASLAction.CREATE, CASLSubject.TASK),
            Rule(CASLAction.UPDATE, CASLSubject.TASK),
            Rule(CASLAction.READ, CASLSubject.STOCK_MOVEMENT),
            Rule(CASLAction.READ, CASLSubject.STOCK_RESERVATION),
            Rule(CASLAction.READ, CASLSubject.ORDER),
        )

        UserRole.SEF_EVENIMENTE -> listOf(
            Rule(CASLAction.READ, CASLSubject.RECIPE),
            Rule(CASLAction.CREATE, CASLSubject.RECIPE),
            Rule(CASLAction.UPDATE, CASLSubject.RECIPE),
            Rule(CASLAction.READ, CASLSubject.RAW_MATERIAL),
            Rule(CASLAction.READ, CASLSubject.CONSUMABLE),
            Rule(CASLAction.READ, CASLSubject.TASK),
            Rule(CASLAction.CREATE, CASLSubject.TASK),
            Rule(CASLAction.READ, CASLSubject.STOCK_MOVEMENT),
            Rule(CASLAction.CREATE, CASLSubject.ORDER),
            Rule(CASLAction.READ, CASLSubject.ORDER),
            Rule(CASLAction.UPDATE, CASLSubject.ORDER),
            Rule(CASLAction.CREATE, CASLSubject.ORDER_ITEM),
            Rule(CASLAction.READ, CASLSubject.ORDER_ITEM),
            Rule(CASLAction.READ, CASLSubject.DELIVERY_NOTE),
            Rule(CASLAction.CREATE, CASLSubject.DELIVERY_NOTE),
        )

        UserRole.COFETAR -> listOf(
            Rule(CASLAction.READ, CASLSubject.RECIPE),
            Rule(CASLAction.READ, CASLSubject.RAW_MATERIAL),
            Rule(CASLAction.READ, CASLSubject.CONSUMABLE),
            Rule(CASLAction.READ, CASLSubject.TASK),
            Rule(CASLAction.CREATE, CASLSubject.TASK),
            Rule(CASLAction.UPDATE, CASLSubject.TASK),
            Rule(CASLAction.READ, CASLSubject.STOCK_MOVEMENT),
            Rule(CASLAction.READ, CASLSubject.ORDER),
        )

        UserRole.PATISER -> listOf(
            Rule(CASLAction.READ, CASLSubject.RECIPE),
            Rule(CASLAction.READ, CASLSubject.RAW_MATERIAL),
            Rule(CASLAction.READ, CASLSubject.CONSUMABLE),
            Rule(CASLAction.READ, CASLSubject.TASK),
            Rule(CASLAction.CREATE, CASLSubject.TASK),
            Rule(CASLAction.UPDATE, CASLSubject.TASK),
            Rule(CASLAction.READ, CASLSubject.STOCK_MOVEMENT),
            Rule(CASLAction.READ, CASLSubject.ORDER),
        )

        UserRole.AJUTOR_COFETAR -> listOf(
            Rule(CASLAction.READ, CASLSubject.RECIPE),
            Rule(CASLAction.READ, CASLSubject.RAW_MATERIAL),
            Rule(CASLAction.READ, CASLSubject.TASK),
        )

        UserRole.MAGAZIONER -> listOf(
            Rule(CASLAction.READ, CASLSubject.RAW_MATERIAL),
            Rule(CASLAction.CREATE, CASLSubject.RAW_MATERIAL),
            Rule(CASLAction.UPDATE, CASLSubject.RAW_MATERIAL),
            Rule(CASLAction.READ, CASLSubject.CONSUMABLE),
            Rule(CASLAction.CREATE, CASLSubject.CONSUMABLE),
            Rule(CASLAction.UPDATE, CASLSubject.CONSUMABLE),
            Rule(CASLAction.READ, CASLSubject.STOCK_MOVEMENT),
            Rule(CASLAction.CREATE, CASLSubject.STOCK_MOVEMENT),
            Rule(CASLAction.READ, CASLSubject.TASK),
            Rule(CASLAction.READ, CASLSubject.RECIPE),
            Rule(CASLAction.READ, CASLSubject.ORDER),
        )
    }
}
