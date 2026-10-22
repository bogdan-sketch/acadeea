import Foundation

actor RecipeService {
    static let shared = RecipeService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/recipes" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()

    func fetchRecipes(query: RecipeQuery) async throws -> PaginatedResponse<RecipeResponse> {
        var components = URLComponents(string: baseURL)!
        components.queryItems = query.queryItems
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<RecipeResponse>.self, from: data)
    }

    func fetchRecipe(id: String) async throws -> RecipeResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RecipeResponse.self, from: data)
    }

    /// Search recipes by name — returns summaries for pickers, sorted
    /// alphabetically with Romanian collation (case- and diacritic-aware, so
    /// "Ălbinuta" lands next to "Albinuta", not at the end). The backend has no
    /// stable ordering, so pickers would otherwise show an arbitrary sequence;
    /// the page is large enough that the whole catalogue is sorted, not the
    /// first 20 rows of an arbitrary order.
    func searchRecipes(name: String) async throws -> [RecipeSummary] {
        var query = RecipeQuery()
        query.search = name
        query.limit = 200
        let result = try await fetchRecipes(query: query)
        return result.data
            .map {
                RecipeSummary(
                    id: $0.id,
                    name: $0.name,
                    type: $0.type,
                    unit: $0.unit,
                    yieldQuantity: $0.yieldQuantity
                )
            }
            .sorted { RecipeService.romanianSort($0.name, $1.name) }
    }

    /// `a < b` under Romanian collation, case-insensitive.
    nonisolated static func romanianSort(_ a: String, _ b: String) -> Bool {
        a.compare(
            b,
            options: [.caseInsensitive],
            range: nil,
            locale: Locale(identifier: "ro_RO")
        ) == .orderedAscending
    }

    func createRecipe(_ body: CreateRecipeRequest) async throws -> RecipeResponse {
        let url = URL(string: baseURL)!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(RecipeResponse.self, from: data)
    }

    func updateRecipePartial(id: String, _ body: UpdateRecipeRequest) async throws -> RecipeResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RecipeResponse.self, from: data)
    }

    func updateRecipe(id: String, _ body: CreateRecipeRequest) async throws -> RecipeResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RecipeResponse.self, from: data)
    }

    func fetchYieldHistory(recipeId: String, page: Int = 1, limit: Int = 20) async throws -> PaginatedResponse<RecipeYieldHistoryResponse> {
        var components = URLComponents(string: "\(baseURL)/\(recipeId)/yield-history")!
        components.queryItems = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<RecipeYieldHistoryResponse>.self, from: data)
    }

    func fetchRecipeCost(id: String) async throws -> RecipeCostResponse {
        let url = URL(string: "\(baseURL)/\(id)/cost")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RecipeCostResponse.self, from: data)
    }

    func fetchRecipeVersions(id: String) async throws -> [RecipeVersionResponse] {
        let url = URL(string: "\(baseURL)/\(id)/versions")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([RecipeVersionResponse].self, from: data)
    }

    /// Archive/unarchive — dedicated endpoint so the flag never touches versioning.
    /// `PATCH /recipes/:id/archive` body `{ archived }`.
    func setArchived(id: String, archived: Bool) async throws -> RecipeResponse {
        let url = URL(string: "\(baseURL)/\(id)/archive")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try JSONEncoder().encode(["archived": archived])
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RecipeResponse.self, from: data)
    }

    /// Publish/unpublish a draft — dedicated endpoint so the flag never touches
    /// versioning. `PATCH /recipes/:id/draft` body `{ draft }`.
    func setDraft(id: String, draft: Bool) async throws -> RecipeResponse {
        let url = URL(string: "\(baseURL)/\(id)/draft")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try JSONEncoder().encode(["draft": draft])
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RecipeResponse.self, from: data)
    }

    func deleteRecipe(id: String) async throws {
        let url = URL(string: "\(baseURL)/\(id)")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
    }

    /// `POST /recipes/bulk-delete/preview` — what a cascade delete of `ids` would also touch.
    func bulkDeletePreview(ids: [String]) async throws -> BulkDeletePreview {
        let url = URL(string: "\(baseURL)/bulk-delete/preview")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder().encode(BulkDeletePreviewRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeletePreview.self, from: data)
    }

    /// `POST /recipes/bulk-delete (fails per row when the recipe has tasks in history / orders)` — cascade delete (user confirmed the preview); per-row failures come back in `failed`.
    func bulkDelete(ids: [String]) async throws -> BulkDeleteResult {
        let url = URL(string: "\(baseURL)/bulk-delete")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder().encode(BulkDeleteRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeleteResult.self, from: data)
    }

    /// `POST …/bulk-action` — one action (status, assign, …) on many rows; per-row failures come back in `failed`.
    func bulkAction(ids: [String], action: String, params: BulkParams) async throws -> BulkActionResult {
        let url = URL(string: "\(baseURL)/bulk-action")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder().encode(BulkActionRequest(ids: ids, action: action, params: params))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkActionResult.self, from: data)
    }

    // MARK: - Super-categories (dynamic top toggle)

    /// The dynamic, ordered list of super-categories driving the top selector.
    /// `GET /recipes/super-categories` → `[{ kind, name, color, isSystem }]`.
    func fetchSuperCategories() async throws -> [SuperCategory] {
        let url = URL(string: "\(baseURL)/super-categories")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([SuperCategory].self, from: data)
    }

    /// Create a new super-category.
    /// `POST /recipes/super-categories` body `{ name, color }` → updated list.
    @discardableResult
    func createSuperCategory(name: String, color: String) async throws -> [SuperCategory] {
        let url = URL(string: "\(baseURL)/super-categories")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder().encode(["name": name, "color": color])
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode([SuperCategory].self, from: data)
    }

    /// Rename and/or recolour a super-category (system: name ignored, colour applies).
    /// `PATCH /recipes/super-categories/:kind` body `{ name?, color? }`.
    @discardableResult
    func updateSuperCategory(kind: String, name: String? = nil, color: String? = nil) async throws -> [SuperCategory] {
        let encoded = kind.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? kind
        let url = URL(string: "\(baseURL)/super-categories/\(encoded)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        var body: [String: String] = [:]
        if let name { body["name"] = name }
        if let color { body["color"] = color }
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([SuperCategory].self, from: data)
    }

    /// Delete a super-category and all its sub-categories (system rejected with 400).
    /// `DELETE /recipes/super-categories/:kind`.
    @discardableResult
    func deleteSuperCategory(kind: String) async throws -> [SuperCategory] {
        let encoded = kind.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? kind
        let url = URL(string: "\(baseURL)/super-categories/\(encoded)")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([SuperCategory].self, from: data)
    }

    // MARK: - Helpers

    // MARK: - Photo

    /// `POST /recipes/:id/photo` (multipart field `photo`). The server converts
    /// to WebP and returns the recipe with a RELATIVE `photoUrl`.
    func uploadPhoto(recipeId: String, data: Data, filename: String, mime: String) async throws -> RecipeResponse {
        let url = URL(string: "\(baseURL)/\(recipeId)/photo")!
        let request = MultipartImageRequest.make(url: url, field: "photo", data: data, filename: filename, mime: mime)
        let (body, response) = try await APIClient.authenticatedData(for: request)
        try MultipartImageRequest.validate(response, data: body)
        return try decoder.decode(RecipeResponse.self, from: body)
    }

    /// `DELETE /recipes/:id/photo` → recipe with `photoUrl == nil`.
    func deletePhoto(recipeId: String) async throws -> RecipeResponse {
        let url = URL(string: "\(baseURL)/\(recipeId)/photo")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try MultipartImageRequest.validate(response, data: data)
        return try decoder.decode(RecipeResponse.self, from: data)
    }

    private func authenticatedRequest(url: URL, method: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    /// Fetch admin categories for a kind ("RECIPE" default, or "PRODUCT").
    func fetchCategories(kind: String = "RECIPE") async throws -> [String] {
        let url = URL(string: "\(baseURL)/categories?kind=\(kind)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([String].self, from: data)
    }

    /// Categories with their system flag, for the admin management screen.
    func fetchCategoryConfigs(kind: String = "RECIPE") async throws -> [CategoryConfig] {
        let url = URL(string: "\(baseURL)/categories/detailed?kind=\(kind)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([CategoryConfig].self, from: data)
    }

    /// Add a new category to a kind.
    /// No `parentName` → creates a SUPER-category (pass `color`).
    /// With `parentName` → creates a SUB-category under that super (colour inherited; omit `color`).
    func addCategory(
        name: String,
        kind: String = "RECIPE",
        color: String? = nil,
        parentName: String? = nil
    ) async throws -> [String] {
        let url = URL(string: "\(baseURL)/categories")!
        var request = authenticatedRequest(url: url, method: "POST")
        var body: [String: String] = ["name": name, "kind": kind]
        if let parentName { body["parentName"] = parentName }
        else if let color { body["color"] = color }
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode([String].self, from: data)
    }

    /// The colours of the 3 super-category KINDS (Materii prime / Semipreparate / Produse finite).
    /// `GET /recipes/category-kinds` → always the 3 kinds with their hex colours.
    func fetchKindColors() async throws -> [KindColor] {
        let url = URL(string: "\(baseURL)/category-kinds")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([KindColor].self, from: data)
    }

    /// Set a KIND's colour (all its flat sub-categories inherit it).
    /// `PATCH /recipes/category-kinds/:kind` body `{ color: "#RRGGBB" }` → updated list.
    @discardableResult
    func setKindColor(kind: String, color: String) async throws -> [KindColor] {
        let encoded = kind.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? kind
        let url = URL(string: "\(baseURL)/category-kinds/\(encoded)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try JSONEncoder().encode(["color": color])
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([KindColor].self, from: data)
    }

    /// Every category across all kinds with its effective colour, for the stock carousel.
    func fetchCategoryCarousel() async throws -> [CarouselCategory] {
        let url = URL(string: "\(baseURL)/categories/carousel")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([CarouselCategory].self, from: data)
    }

    /// Rename and/or recolour a category of a kind (re-tags everything that used it).
    /// Pass `color` (hex like "#43A047") to change a super-category's colour; for a
    /// colour-only change send the same name plus the new colour. System categories
    /// keep their name (pass the unchanged name) but their colour can still change.
    func renameCategory(
        oldName: String,
        newName: String,
        kind: String = "RECIPE",
        color: String? = nil
    ) async throws -> [String] {
        let encoded = oldName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? oldName
        let url = URL(string: "\(baseURL)/categories/\(encoded)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        var body: [String: String] = ["name": newName, "kind": kind]
        if let color { body["color"] = color }
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([String].self, from: data)
    }

    // MARK: - Reordering (single global display order)

    /// Set the ONE global display order across every super-category's categories.
    /// `items` is the full flat list (index = global order), each `{ name, kind }`.
    /// `PATCH /recipes/categories/reorder-global` body `{ items }` → the carousel list
    /// (same shape as `fetchCategoryCarousel`, now sorted by the new global ordinal).
    @discardableResult
    func reorderAllCategories(items: [CategoryOrderItem]) async throws -> [CarouselCategory] {
        let url = URL(string: "\(baseURL)/categories/reorder-global")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try JSONEncoder().encode(["items": items])
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([CarouselCategory].self, from: data)
    }

    /// Remove a category of a kind.
    func removeCategory(name: String, kind: String = "RECIPE") async throws -> [String] {
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        let url = URL(string: "\(baseURL)/categories/\(encoded)?kind=\(kind)")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([String].self, from: data)
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

/// A category plus whether it is a system (non-editable) category.
/// `parentName == nil` → a super-category whose `color` is the chosen hex.
/// `parentName != nil` → a sub-category; `color` is the inherited parent colour.
struct CategoryConfig: Decodable, Identifiable, Sendable {
    let name: String
    let isSystem: Bool
    let color: String?
    let parentName: String?
    var id: String { name }

    var isSuperCategory: Bool { parentName == nil }
}

/// The colour of one of the 3 super-category KINDS.
/// `GET/PATCH /recipes/category-kinds` — every flat sub-category of the kind inherits this colour.
struct KindColor: Decodable, Identifiable, Sendable {
    let kind: String
    let color: String
    var id: String { kind }
}

/// A dynamic super-category: the top-level toggle the user sees and can manage.
/// `GET/POST/PATCH/DELETE /recipes/super-categories`. Each carries a colour that
/// every flat sub-category beneath it inherits. The 3 originals are `isSystem`
/// (recolour only — no rename/delete); custom ones are fully editable.
struct SuperCategory: Decodable, Identifiable, Sendable, Hashable {
    let kind: String
    let name: String
    let color: String
    let isSystem: Bool
    var id: String { kind }
}

/// One entry of the global category order sent to `PATCH /recipes/categories/reorder-global`.
struct CategoryOrderItem: Encodable, Sendable {
    let name: String
    let kind: String
}

/// A single category from the cross-kind carousel feed, with its effective colour.
/// `GET /recipes/categories/carousel` — sorted by the global ordinal.
struct CarouselCategory: Decodable, Identifiable, Sendable {
    let name: String
    let kind: String
    let color: String?
    let parentName: String?
    var id: String { "\(kind)/\(name)" }
}
