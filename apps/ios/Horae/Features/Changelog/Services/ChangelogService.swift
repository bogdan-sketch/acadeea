import Foundation

actor ChangelogService {
    static let shared = ChangelogService()

    private let decoder: JSONDecoder = APIClient.makeDecoder()

    /// Public endpoint — no auth required.
    func fetchChangelog() async throws -> ChangelogResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/changelog")!
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.from(data: data, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return try decoder.decode(ChangelogResponse.self, from: data)
    }
}
