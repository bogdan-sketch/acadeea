import Foundation

actor TutorialService {
    static let shared = TutorialService()

    private let decoder: JSONDecoder = APIClient.makeDecoder()

    /// Public endpoint — no auth required (same shape as the changelog: curated
    /// static content, identical for every tenant).
    func fetchContent() async throws -> [TutorialFlow] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/tutorial/content")!
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.from(
                data: data, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return try decoder.decode(TutorialContentResponse.self, from: data).flows
    }
}
