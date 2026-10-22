import Foundation

/// All navigable destinations in the app.
enum Route: Hashable {
    // Tasks
    case taskList
    case taskDetail(id: String)
    case taskCreate
    case taskCreateFromRecipe(recipeId: String)
    case taskEdit(id: String)
    case productionCalendar
    case stockHistory(materialId: String, materialTitle: String)

    // Recipes
    case recipeList
    case recipeDetail(id: String)
    case recipeCreate
    case recipeEdit(id: String)
    case recipeYieldHistory(id: String)
    case recipeCost(id: String)
    case recipeVersionHistory(id: String)
    case recipePricing(id: String)
    case priceHistory

    // Stock
    case rawMaterialList
    case rawMaterialDetail(id: String)
    case consumableList
    case consumableDetail(id: String)
    case stockMovements
    case stockReview
    case stockMovementCreate
    case recipeStockDetail(id: String)
    case expiryTracking
    case batchReceive
    case testConsumption
    case requirementsPlan
    case stockSearch
    case suppliers
    case salesDeductions
    case salesDeductionDetail(id: String)

    // Users
    case userList
    case userDetail(id: String)

    // Roles
    case roleList
    case roleDetail(id: String)
    case roleCreate

    // Orders
    case orderList
    case orderDetail(id: String)
    case orderCreate
    case orderDeliveryNote(id: String)
    case orderStats
    case orderCalendar

    // Settings
    /// Profil & setări (tabs Date | Setări).
    case settings
    /// Profil › Setări › Companie — edit the company data printed on documents.
    case companyEdit
    case brandingSettings
    case categoryManagement
    case changelog
    case linkedAccounts
    case backupSettings
    case dataReset

    // Help / tutorial
    case helpCenter

    // Locations & Transfers
    case locationList
    case locationCreate
    case locationEdit(id: String)
    case locationStock(id: String)
    case locationDashboard(id: String)
    case locationUsers(id: String)
    case myLocations
    case transferList
    case transferDetail(id: String)
    case transferCreate
    case transferApproval(id: String)

    // Shopping list
    case shoppingList

    // Analytics
    case analyticsDashboard

    // Integrations
    case integrationList
    case integrationDetail(id: String)

    // Activity
    case activityFeed

    // Notifications
    case notificationInbox
}

extension Route {
    /// Stable, analytics-friendly screen name (the case label without its
    /// associated values), e.g. `taskDetail(id: "42")` → `"taskDetail"`.
    /// Used for PostHog screen tracking at the Route resolver.
    var screenName: String {
        let label = "\(self)"
        return label.prefix(while: { $0 != "(" }).description
    }
}
