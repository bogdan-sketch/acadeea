import Foundation

/// Vânzări → stoc: DRAFT (Excel eBriza / manual / WooCommerce) → review → bulk confirm.
/// Mirrors apps/api `sales-deductions.controller.ts` — one method per endpoint.
/// Reads need `read StockMovement`, writes `create StockMovement`; every route
/// except `feature` 404s while the env flag is off.
actor SalesDeductionService {
    static let shared = SalesDeductionService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/sales-deductions" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    // MARK: - Feature + catalog

    /// `GET /sales-deductions/feature` → whether the feature is on for this environment.
    func fetchFeature() async throws -> Bool {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/feature")!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(SalesDeductionFeatureResponse.self, from: data).enabled
    }

    /// `GET /sales-deductions/template?locationId=` — CSV with every sellable product, quantity blank.
    func fetchTemplateCsv(locationId: String) async throws -> Data {
        var components = URLComponents(string: "\(baseURL)/template")!
        components.queryItems = [URLQueryItem(name: "locationId", value: locationId)]
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return data
    }

    /// `GET /sales-deductions/products?locationId=` — products with their stock at the location.
    func fetchProducts(locationId: String) async throws -> [SalesProductOption] {
        var components = URLComponents(string: "\(baseURL)/products")!
        components.queryItems = [URLQueryItem(name: "locationId", value: locationId)]
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([SalesProductOption].self, from: data)
    }

    // MARK: - Log

    /// `GET /sales-deductions?page=&limit=` — confirmed / reverted / open drafts.
    func fetchList(page: Int, limit: Int = 20) async throws -> PaginatedResponse<SalesDeduction> {
        var components = URLComponents(string: baseURL)!
        components.queryItems = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<SalesDeduction>.self, from: data)
    }

    /// `GET /sales-deductions/:id` — with lines (+ live candidates/stock while DRAFT).
    func fetchDeduction(id: String) async throws -> SalesDeduction {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)")!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(SalesDeduction.self, from: data)
    }

    // MARK: - Create a DRAFT

    /// `POST /sales-deductions/excel` (multipart `file` + `locationId`) → 201 DRAFT.
    func createFromExcel(fileData: Data, fileName: String, mimeType: String, locationId: String) async throws -> SalesDeduction {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: URL(string: "\(baseURL)/excel")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let safeName = fileName.replacingOccurrences(of: "\"", with: "'")
        var body = Data()
        body.appendUTF8("--\(boundary)\r\n")
        body.appendUTF8("Content-Disposition: form-data; name=\"locationId\"\r\n\r\n")
        body.appendUTF8("\(locationId)\r\n")
        body.appendUTF8("--\(boundary)\r\n")
        body.appendUTF8("Content-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\n")
        body.appendUTF8("Content-Type: \(mimeType)\r\n\r\n")
        body.append(fileData)
        body.appendUTF8("\r\n--\(boundary)--\r\n")
        request.httpBody = body

        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(SalesDeduction.self, from: data)
    }

    /// `POST /sales-deductions/manual` → 201 empty DRAFT.
    func createManual(locationId: String) async throws -> SalesDeduction {
        var request = authenticatedRequest(url: URL(string: "\(baseURL)/manual")!, method: "POST")
        request.httpBody = try encoder.encode(CreateManualSalesDeductionRequest(locationId: locationId))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(SalesDeduction.self, from: data)
    }

    /// `POST /sales-deductions/woocommerce` `{locationId, from, to}` → 201 DRAFT.
    func createFromWoo(locationId: String, from: Date, to: Date) async throws -> SalesDeduction {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var request = authenticatedRequest(url: URL(string: "\(baseURL)/woocommerce")!, method: "POST")
        request.httpBody = try encoder.encode(
            CreateWooSalesDeductionRequest(locationId: locationId, from: iso.string(from: from), to: iso.string(from: to))
        )
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(SalesDeduction.self, from: data)
    }

    // MARK: - Confirm / discard / revert

    /// `POST /sales-deductions/:id/confirm` → 200. 409 `SALES_001` when a line sells more
    /// than in stock without `acceptShortfall`/`stockOverride`; `SALES_002` if already final.
    func confirm(id: String, lines: [ConfirmSalesDeductionLine], note: String?) async throws -> SalesDeduction {
        var request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)/confirm")!, method: "POST")
        request.httpBody = try encoder.encode(ConfirmSalesDeductionRequest(lines: lines, note: note))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(SalesDeduction.self, from: data)
    }

    /// `POST /sales-deductions/:id/discard` → 204 (draft kept as ANULAT, hidden from the log).
    func discard(id: String) async throws {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)/discard")!, method: "POST")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 204)
    }

    /// `POST /sales-deductions/:id/revert` → 200 — puts each line's net delta back.
    func revert(id: String) async throws -> SalesDeduction {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)/revert")!, method: "POST")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(SalesDeduction.self, from: data)
    }

    /// `POST /sales-deductions/bulk-delete/preview` — what a cascade delete of `ids` would also touch.
    func bulkDeletePreview(ids: [String]) async throws -> BulkDeletePreview {
        let url = URL(string: "\(baseURL)/bulk-delete/preview")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeletePreviewRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeletePreview.self, from: data)
    }

    /// `POST /sales-deductions/bulk-delete (CONFIRMED ones are reverted first)` — cascade delete (user confirmed the preview); per-row failures come back in `failed`.
    func bulkDelete(ids: [String]) async throws -> BulkDeleteResult {
        let url = URL(string: "\(baseURL)/bulk-delete")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeleteRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeleteResult.self, from: data)
    }

    /// `POST …/bulk-action` — one action (status, assign, …) on many rows; per-row failures come back in `failed`.
    func bulkAction(ids: [String], action: String, params: BulkParams) async throws -> BulkActionResult {
        let url = URL(string: "\(baseURL)/bulk-action")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkActionRequest(ids: ids, action: action, params: params))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkActionResult.self, from: data)
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

private extension Data {
    mutating func appendUTF8(_ string: String) {
        append(Data(string.utf8))
    }
}
