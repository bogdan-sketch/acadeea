import Foundation

/// Handles all order API calls.
actor OrderService {
    static let shared = OrderService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/orders" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    // MARK: - List

    func fetchOrders(query: OrderQuery) async throws -> PaginatedResponse<OrderResponse> {
        var query = query
        if !supportsOrderViews { query.view = nil; query.deliveryMethod = nil; query.deliveryKind = nil }
        // API without `statuses=` (pre-1.39.0): one status goes as `status=`,
        // several are filtered here on the loaded page.
        var localStatuses: Set<OrderStatus>?
        if !supportsStatusesParam, let statuses = query.statuses, !statuses.isEmpty {
            query.statuses = nil
            if statuses.count == 1 {
                query.status = statuses[0]
            } else {
                localStatuses = Set(statuses)
            }
        }
        var components = URLComponents(string: baseURL)!
        components.queryItems = query.queryItems

        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        if query.statuses?.isEmpty == false, Self.rejectsUnknownParam(response, data, named: "statuses") {
            supportsStatusesParam = false
            return try await fetchOrders(query: query)
        }
        if let localStatuses {
            try validateResponse(response, data: data)
            let page = try decoder.decode(PaginatedResponse<OrderResponse>.self, from: data)
            return PaginatedResponse(
                data: page.data.filter { localStatuses.contains($0.status) },
                total: page.total, page: page.page, limit: page.limit, totalPages: page.totalPages)
        }
        if (query.view != nil || query.deliveryMethod != nil || query.deliveryKind != nil), Self.rejectsUnknownParam(response, data) {
            // API older than 1.37.0 (whitelist rejects `view`): drop the new
            // params for this session — the list still sorts/groups locally.
            supportsOrderViews = false
            return try await fetchOrders(query: query)
        }
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<OrderResponse>.self, from: data)
    }

    /// False once the API rejected `view` / `deliveryMethod` (pre-1.37.0).
    private var supportsOrderViews = true
    /// False once the API rejected `statuses` (pre-1.39.0).
    private var supportsStatusesParam = true

    /// 400 from the DTO whitelist ("property x should not exist"); with
    /// `named`, only when that property is the one rejected.
    private static func rejectsUnknownParam(_ response: URLResponse, _ data: Data, named: String? = nil) -> Bool {
        guard (response as? HTTPURLResponse)?.statusCode == 400 else { return false }
        let body = String(decoding: data, as: UTF8.self)
        guard body.contains("should not exist") else { return false }
        guard let named else { return true }
        return body.contains("\(named) should not exist")
    }

    // MARK: - Get by ID

    func fetchOrder(id: String) async throws -> OrderResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    // MARK: - Create

    func createOrder(_ body: CreateOrderRequest) async throws -> OrderResponse {
        let url = URL(string: baseURL)!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    // MARK: - Update

    func updateOrder(id: String, _ body: UpdateOrderRequest) async throws -> OrderResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    // MARK: - Items

    func addItem(orderId: String, _ body: AddOrderItemRequest) async throws -> OrderResponse {
        let url = URL(string: "\(baseURL)/\(orderId)/items")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    func updateItem(orderId: String, itemId: String, _ body: UpdateOrderItemRequest) async throws -> OrderResponse {
        let url = URL(string: "\(baseURL)/\(orderId)/items/\(itemId)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    func removeItem(orderId: String, itemId: String) async throws -> OrderResponse {
        let url = URL(string: "\(baseURL)/\(orderId)/items/\(itemId)")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    // MARK: - Delivery Note

    func createDeliveryNote(orderId: String) async throws -> OrderResponse {
        let url = URL(string: "\(baseURL)/\(orderId)/delivery-note")!
        let request = authenticatedRequest(url: url, method: "POST")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    func getDeliveryNote(orderId: String) async throws -> DeliveryNoteResponse {
        let url = URL(string: "\(baseURL)/\(orderId)/delivery-note")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(DeliveryNoteResponse.self, from: data)
    }

    /// Fetch signature image as raw PNG data.
    func fetchSignatureImage(orderId: String) async throws -> Data {
        let url = URL(string: "\(baseURL)/\(orderId)/delivery-note/signature")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw APIError.notFound
        }
        return data
    }

    /// Upload signature image as multipart form data.
    func signDeliveryNote(orderId: String, signedByName: String, signatureImage: Data, notes: String? = nil) async throws -> OrderResponse {
        let url = URL(string: "\(baseURL)/\(orderId)/delivery-note/sign")!
        let boundary = UUID().uuidString

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body = Data()

        // signedByName field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"signedByName\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(signedByName)\r\n".data(using: .utf8)!)

        // notes field (optional)
        if let notes {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"notes\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(notes)\r\n".data(using: .utf8)!)
        }

        // signature file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"signature\"; filename=\"signature.png\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(signatureImage)
        body.append("\r\n".data(using: .utf8)!)

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    // MARK: - Invoice

    func uploadInvoice(orderId: String, fileData: Data, fileName: String, mimeType: String) async throws -> OrderResponse {
        let url = URL(string: "\(baseURL)/\(orderId)/invoice")!
        let boundary = UUID().uuidString

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"invoice\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    func downloadInvoice(orderId: String) async throws -> (data: Data, fileName: String, mimeType: String) {
        let url = URL(string: "\(baseURL)/\(orderId)/invoice")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw APIError.notFound
        }
        let contentType = httpResponse.value(forHTTPHeaderField: "Content-Type") ?? "application/pdf"
        let disposition = httpResponse.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        let name = disposition.components(separatedBy: "filename=").last?.trimmingCharacters(in: .init(charactersIn: "\"")) ?? "factura"
        return (data, name, contentType)
    }

    func deleteInvoice(orderId: String) async throws -> OrderResponse {
        let url = URL(string: "\(baseURL)/\(orderId)/invoice")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    /// `POST /orders/bulk-delete/preview` — what a cascade delete of `ids` would also touch.
    func bulkDeletePreview(ids: [String]) async throws -> BulkDeletePreview {
        let url = URL(string: "\(baseURL)/bulk-delete/preview")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeletePreviewRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeletePreview.self, from: data)
    }

    /// `POST /orders/bulk-delete` — cascade delete (user confirmed the preview); per-row failures come back in `failed`.
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

    // MARK: - Stats

    func fetchStats(dateFrom: Date? = nil) async throws -> OrderStatsResponse {
        var components = URLComponents(string: "\(baseURL)/stats")!
        if let dateFrom {
            let formatter = ISO8601DateFormatter()
            components.queryItems = [URLQueryItem(name: "dateFrom", value: formatter.string(from: dateFrom))]
        }
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(OrderStatsResponse.self, from: data)
    }

    // MARK: - Conformity Certificate

    func createConformityCertificate(orderId: String, notes: String? = nil) async throws -> OrderResponse {
        let url = URL(string: "\(baseURL)/\(orderId)/conformity-certificate")!
        var request = authenticatedRequest(url: url, method: "POST")
        if let notes {
            request.httpBody = try encoder.encode(["notes": notes])
        } else {
            request.httpBody = "{}".data(using: .utf8)
        }
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(OrderResponse.self, from: data)
    }

    func getConformityCertificate(orderId: String) async throws -> ConformityCertificateResponse {
        let url = URL(string: "\(baseURL)/\(orderId)/conformity-certificate")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(ConformityCertificateResponse.self, from: data)
    }

    func downloadConformityCertificatePDF(orderId: String) async throws -> (data: Data, fileName: String) {
        let url = URL(string: "\(baseURL)/\(orderId)/conformity-certificate/pdf")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw APIError.notFound
        }
        let disposition = httpResponse.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        let name = disposition.components(separatedBy: "filename=").last?.trimmingCharacters(in: .init(charactersIn: "\"")) ?? "certificat-conformitate.pdf"
        return (data, name)
    }

    // MARK: - Calendar

    func fetchCalendar(
        from: String? = nil,
        to: String? = nil,
        status: [OrderStatus]? = nil,
        view: OrderAreaView? = nil,
        deliveryMethod: String? = nil,
        deliveryKind: DeliveryKind? = nil
    ) async throws -> [String: [OrderResponse]] {
        var components = URLComponents(string: "\(baseURL)/calendar")!
        var items: [URLQueryItem] = []
        if let from { items.append(URLQueryItem(name: "from", value: from)) }
        if let to { items.append(URLQueryItem(name: "to", value: to)) }
        if let status, !status.isEmpty {
            items.append(URLQueryItem(name: "status", value: status.map(\.rawValue).joined(separator: ",")))
        }
        let sendsNewParams = supportsOrderViews && (view != nil || deliveryMethod != nil || deliveryKind != nil)
        if sendsNewParams {
            if let view { items.append(URLQueryItem(name: "view", value: view.rawValue)) }
            if let deliveryMethod { items.append(URLQueryItem(name: "deliveryMethod", value: deliveryMethod)) }
            if let deliveryKind { items.append(URLQueryItem(name: "deliveryKind", value: deliveryKind.rawValue)) }
        }
        if !items.isEmpty { components.queryItems = items }

        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        if sendsNewParams, Self.rejectsUnknownParam(response, data) {
            supportsOrderViews = false
            return try await fetchCalendar(from: from, to: to, status: status)
        }
        try validateResponse(response, data: data)
        return try decoder.decode([String: [OrderResponse]].self, from: data)
    }

    // MARK: - Delivery methods

    /// `GET /orders/delivery-methods` — shop delivery methods, most used first.
    func fetchDeliveryMethods() async throws -> [DeliveryMethodInfo] {
        let url = URL(string: "\(baseURL)/delivery-methods")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([DeliveryMethodInfo].self, from: data)
    }

    /// `PUT /orders/delivery-methods/alias` (admin) — omitted fields stay
    /// unchanged, explicit null resets (default label / auto kind); returns the full list.
    func setDeliveryMethodAlias(_ body: DeliveryMethodAliasRequest) async throws -> [DeliveryMethodInfo] {
        let url = URL(string: "\(baseURL)/delivery-methods/alias")!
        var request = authenticatedRequest(url: url, method: "PUT")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([DeliveryMethodInfo].self, from: data)
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
