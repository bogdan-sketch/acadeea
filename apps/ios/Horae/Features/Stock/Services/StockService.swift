import Foundation

actor StockService {
    static let shared = StockService()

    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    // MARK: - Raw Materials

    func fetchRawMaterials(query: RawMaterialQuery) async throws -> PaginatedResponse<RawMaterialResponse> {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/raw-materials")!
        components.queryItems = query.queryItems
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<RawMaterialResponse>.self, from: data)
    }

    func fetchRawMaterial(id: String) async throws -> RawMaterialResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/\(id)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RawMaterialResponse.self, from: data)
    }

    func fetchPriceHistory(rawMaterialId: String) async throws -> [PriceHistoryEntry] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/\(rawMaterialId)/price-history")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([PriceHistoryEntry].self, from: data)
    }

    /// Intake history (stock lots) for a raw material, newest first.
    func fetchLots(rawMaterialId: String) async throws -> [StockLotEntry] {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/stock/lots")!
        components.queryItems = [URLQueryItem(name: "rawMaterialId", value: rawMaterialId)]
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([StockLotEntry].self, from: data)
    }

    /// Hold/release a lot for FIFO — held lots are consumed only after every
    /// other lot is exhausted.
    func setLotHold(id: String, onHold: Bool) async throws -> StockLotEntry {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/lots/\(id)/hold")!
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        struct Body: Encodable { let onHold: Bool }
        request.httpBody = try JSONEncoder().encode(Body(onHold: onHold))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.from(data: data, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
        }
        return try APIClient.makeDecoder().decode(StockLotEntry.self, from: data)
    }

    // MARK: - Consumables

    func fetchConsumables(query: ConsumableQuery) async throws -> PaginatedResponse<ConsumableResponse> {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/consumables")!
        components.queryItems = query.queryItems
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<ConsumableResponse>.self, from: data)
    }

    func fetchConsumable(id: String) async throws -> ConsumableResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/consumables/\(id)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(ConsumableResponse.self, from: data)
    }

    func createRawMaterial(_ body: CreateRawMaterialRequest) async throws -> RawMaterialResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(RawMaterialResponse.self, from: data)
    }

    /// Delete (discontinue) a raw material. The backend soft-deletes — sets
    /// status DISCONTINUED — keeping its history/stock movements intact.
    @discardableResult
    func deleteRawMaterial(id: String) async throws -> RawMaterialResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/\(id)")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RawMaterialResponse.self, from: data)
    }

    /// Pre-delete check: hard delete allowed only at stock 0; `everUsed` says
    /// the material has recipe/production history (fine print in the confirm).
    func fetchRawMaterialDeleteInfo(id: String) async throws -> RawMaterialDeleteInfo {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/\(id)/delete-info")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RawMaterialDeleteInfo.self, from: data)
    }

    /// Permanently delete a raw material (mistake cleanup). Backend refuses
    /// with 400 unless stock is exactly 0; removes all history/traceability.
    func hardDeleteRawMaterial(id: String) async throws {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/\(id)?hard=true")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
    }

    /// `POST /raw-materials/bulk-delete/preview` — what a cascade delete of `ids` would also touch.
    func bulkDeleteRawMaterialsPreview(ids: [String]) async throws -> BulkDeletePreview {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/bulk-delete/preview")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeletePreviewRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeletePreview.self, from: data)
    }

    /// `POST /raw-materials/bulk-delete (HARD: stock, movements, lots go too; blocked while on a transfer)` — cascade delete (user confirmed the preview); per-row failures come back in `failed`.
    func bulkDeleteRawMaterials(ids: [String]) async throws -> BulkDeleteResult {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/bulk-delete")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeleteRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeleteResult.self, from: data)
    }

    /// `POST …/bulk-action` — one action (status, assign, …) on many rows; per-row failures come back in `failed`.
    func bulkActionRawMaterials(ids: [String], action: String, params: BulkParams) async throws -> BulkActionResult {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/bulk-action")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkActionRequest(ids: ids, action: action, params: params))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkActionResult.self, from: data)
    }

    /// `POST /consumables/bulk-delete/preview` — what a cascade delete of `ids` would also touch.
    func bulkDeleteConsumablesPreview(ids: [String]) async throws -> BulkDeletePreview {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/consumables/bulk-delete/preview")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeletePreviewRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeletePreview.self, from: data)
    }

    /// `POST /consumables/bulk-delete (HARD: stock history goes too)` — cascade delete (user confirmed the preview); per-row failures come back in `failed`.
    func bulkDeleteConsumables(ids: [String]) async throws -> BulkDeleteResult {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/consumables/bulk-delete")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeleteRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeleteResult.self, from: data)
    }

    /// `POST …/bulk-action` — one action (status, assign, …) on many rows; per-row failures come back in `failed`.
    func bulkActionConsumables(ids: [String], action: String, params: BulkParams) async throws -> BulkActionResult {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/consumables/bulk-action")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkActionRequest(ids: ids, action: action, params: params))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkActionResult.self, from: data)
    }

    func createConsumable(_ body: CreateConsumableRequest) async throws -> ConsumableResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/consumables")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(ConsumableResponse.self, from: data)
    }

    /// Assign/clear a raw material's category (null = Misc).
    func updateRawMaterialCategory(id: String, category: String?) async throws -> RawMaterialResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(UpdateItemCategoryRequest(category: category))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RawMaterialResponse.self, from: data)
    }

    /// Full edit of a raw material.
    func updateRawMaterial(id: String, _ body: UpdateRawMaterialRequest) async throws -> RawMaterialResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RawMaterialResponse.self, from: data)
    }

    /// Assign/clear a raw material's supplier (null unlinks).
    func updateRawMaterialSupplier(id: String, supplierId: String?) async throws -> RawMaterialResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(UpdateMaterialSupplierRequest(supplierId: supplierId))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RawMaterialResponse.self, from: data)
    }

    /// Assign/clear a consumable's category (null = Misc).
    func updateConsumableCategory(id: String, category: String?) async throws -> ConsumableResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/consumables/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(UpdateItemCategoryRequest(category: category))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(ConsumableResponse.self, from: data)
    }

    // MARK: - Stock Movements

    func fetchMovements(query: StockMovementQuery) async throws -> PaginatedResponse<StockMovementResponse> {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/stock/movements")!
        components.queryItems = query.queryItems
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<StockMovementResponse>.self, from: data)
    }

    /// `GET /stock/movements/export` — the movement log as .xlsx (same filters as the list; last 30 days when no range).
    func fetchMovementsXlsx(query: StockMovementQuery) async throws -> Data {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/stock/movements/export")!
        components.queryItems = query.filterItems.isEmpty ? nil : query.filterItems
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return data
    }

    /// `GET /stock/review/export` — "Revizie stocuri": every stock row per lot, 4 sheets (admin only).
    func fetchStockReviewXlsx() async throws -> Data {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/review/export")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return data
    }

    func createMovement(_ body: CreateStockMovementRequest) async throws -> StockMovementResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/movements")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(StockMovementResponse.self, from: data)
    }

    // MARK: - Recipe Stock

    func fetchRecipeStock(query: RecipeStockQuery) async throws -> PaginatedResponse<RecipeStockResponse> {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/stock/recipes")!
        components.queryItems = query.queryItems
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<RecipeStockResponse>.self, from: data)
    }

    func createRecipeMovement(_ body: CreateRecipeMovementRequest) async throws -> StockMovementResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/recipe-movements")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(StockMovementResponse.self, from: data)
    }

    // MARK: - Batch Receive

    func batchReceive(_ body: BatchReceiveRequest) async throws -> [StockMovementResponse] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/movements/batch")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode([StockMovementResponse].self, from: data)
    }

    // MARK: - Consum teste (R&D)

    /// Consume raw materials / consumables for tests: same stock effect as a
    /// production consumption (per-location, FIFO on lots), but with no task and
    /// no recipe output. One IESIRE_TESTE movement per item.
    @discardableResult
    func testConsumption(_ body: TestConsumptionRequest) async throws -> [StockMovementResponse] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/test-consumption")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode([StockMovementResponse].self, from: data)
    }

    // MARK: - Recipe (produced) lots

    /// Production batches with stock left for a recipe, optionally scoped to one
    /// location. FIFO order (earliest expiry first, then oldest production).
    func fetchRecipeLots(recipeId: String, locationId: String? = nil) async throws -> [RecipeLotResponse] {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/stock/recipes/\(recipeId)/lots")!
        if let locationId {
            components.queryItems = [URLQueryItem(name: "locationId", value: locationId)]
        }
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([RecipeLotResponse].self, from: data)
    }

    // MARK: - Item availability

    /// Global + per-location stock of one item (exactly one id), with task
    /// reservations and in-flight transfers. Locations/transfers are empty
    /// for consumables.
    func fetchItemAvailability(
        rawMaterialId: String? = nil,
        consumableId: String? = nil,
        recipeId: String? = nil
    ) async throws -> StockItemAvailability {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/stock/item-availability")!
        var queryItems: [URLQueryItem] = []
        if let rawMaterialId { queryItems.append(URLQueryItem(name: "rawMaterialId", value: rawMaterialId)) }
        if let consumableId { queryItems.append(URLQueryItem(name: "consumableId", value: consumableId)) }
        if let recipeId { queryItems.append(URLQueryItem(name: "recipeId", value: recipeId)) }
        components.queryItems = queryItems
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(StockItemAvailability.self, from: data)
    }

    // MARK: - Stats

    func fetchStockStats() async throws -> StockStatsResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/stats")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(StockStatsResponse.self, from: data)
    }

    // MARK: - Low Stock

    func fetchLowStock() async throws -> [LowStockItem] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/low-stock")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([LowStockItem].self, from: data)
    }

    // MARK: - Expiring

    func fetchExpiring(days: Int = 30) async throws -> [ExpiringItem] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/expiring?days=\(days)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([ExpiringItem].self, from: data)
    }

    // MARK: - Stock Lots

    func fetchLots(rawMaterialId: String? = nil, consumableId: String? = nil) async throws -> [StockLotResponse] {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/stock/lots")!
        var queryItems: [URLQueryItem] = []
        if let rawMaterialId { queryItems.append(URLQueryItem(name: "rawMaterialId", value: rawMaterialId)) }
        if let consumableId { queryItems.append(URLQueryItem(name: "consumableId", value: consumableId)) }
        if !queryItems.isEmpty { components.queryItems = queryItems }
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([StockLotResponse].self, from: data)
    }

    /// Set/clear a raw material's nutrition values (feature-gated UI).
    func updateRawMaterialNutrition(
        id: String,
        nutrition: NutritionValues?,
        allergens: [String]? = nil
    ) async throws -> RawMaterialResponse {
        struct Body: Encodable {
            let nutrition: NutritionValues?
            let allergens: [String]?
            // Encode explicit null to clear server-side.
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                if let nutrition { try c.encode(nutrition, forKey: .nutrition) } else {
                    try c.encodeNil(forKey: .nutrition)
                }
                if let allergens { try c.encode(allergens, forKey: .allergens) }
            }
            enum CodingKeys: String, CodingKey { case nutrition, allergens }
        }
        let url = URL(string: "\(APIClient.baseURL)/api/v1/raw-materials/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(Body(nutrition: nutrition, allergens: allergens))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RawMaterialResponse.self, from: data)
    }

    /// Aggregated nutrition for a recipe (semipreparate expanded to raw materials).
    func fetchRecipeNutrition(recipeId: String) async throws -> RecipeNutritionResult {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/recipes/\(recipeId)/nutrition")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RecipeNutritionResult.self, from: data)
    }

    // MARK: - Requirements plan (necesar MP)

    /// Aggregated raw-material needs for an ad-hoc production plan
    /// (recipe × quantity list). Returns 200, not 201 — it's a computation.
    func planRequirements(items: [RequirementsPlanRequestItem]) async throws -> RequirementsPlanResult {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/requirements-plan")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(RequirementsPlanRequest(items: items))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RequirementsPlanResult.self, from: data)
    }

    /// Same plan rendered as an .xlsx workbook — raw file bytes for sharing.
    func exportRequirementsPlan(items: [RequirementsPlanRequestItem]) async throws -> Data {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/requirements-plan/export")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(RequirementsPlanRequest(items: items))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        // Any 2xx is a successful download — Nest's POST default is 201, so
        // don't fail the export over the exact success code.
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.from(data: data, statusCode: httpResponse.statusCode)
        }
        return data
    }

    // MARK: - Helpers

    private func authenticatedRequest(url: URL, method: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func validateResponse(_ response: URLResponse, data: Data, expectedStatus: Int = 200) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard httpResponse.statusCode == expectedStatus else {
            throw APIError.from(data: data, statusCode: httpResponse.statusCode)
        }
    }
}
