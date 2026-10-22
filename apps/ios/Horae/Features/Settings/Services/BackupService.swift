import Foundation

/// Snapshot-uri ale organizatiei — `/api/v1/backups/snapshots`.
///
/// Toate rutele cer `manage all` (admin) si sunt scopate pe organizatia din JWT;
/// descarcarea fisierului e gardata suplimentar server-side de
/// `BACKUP_ADMIN_EMAILS` si raspunde `403` pentru ceilalti admini.
actor BackupService {
    static let shared = BackupService()

    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/backups/snapshots" }

    // MARK: - Listing

    func fetchSnapshots() async throws -> [OrgSnapshot] {
        let request = authenticatedRequest(url: URL(string: baseURL)!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validate(response, data: data)
        // Backendul ordoneaza deja descrescator; sortam si aici ca lista sa nu
        // depinda de ordinea serverului.
        return try decoder.decode([OrgSnapshot].self, from: data)
            .sorted { $0.createdAt > $1.createdAt }
    }

    // MARK: - Create

    /// Salvare manuala a starii curente. Eticheta e optionala (max 200 caractere server-side).
    func createSnapshot(label: String?) async throws -> OrgSnapshot {
        var request = authenticatedRequest(url: URL(string: baseURL)!, method: "POST")
        let trimmed = label?.trimmingCharacters(in: .whitespacesAndNewlines)
        request.httpBody = try encoder.encode(
            CreateSnapshotRequest(label: (trimmed?.isEmpty ?? true) ? nil : trimmed)
        )
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validate(response, data: data)
        return try decoder.decode(OrgSnapshot.self, from: data)
    }

    // MARK: - Restore

    /// Restaureaza organizatia la starea din snapshot. Backendul invalideaza
    /// TOATE refresh token-urile organizatiei — apelantul trebuie sa delogheze
    /// utilizatorul dupa succes.
    /// - Returns: numarul de randuri reinserate per model.
    func restoreSnapshot(id: String) async throws -> [String: Int] {
        var request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)/restore")!, method: "POST")
        request.httpBody = try encoder.encode(RestoreSnapshotRequest(confirm: "RESTAUREAZA"))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validate(response, data: data)
        return try decoder.decode(RestoreSnapshotResponse.self, from: data).restored
    }

    // MARK: - Download

    /// Fisierul `.json.gz` brut. Arunca `APIError.insufficientPermissions` (403)
    /// pentru adminii care nu sunt in `BACKUP_ADMIN_EMAILS`.
    func downloadSnapshot(id: String) async throws -> Data {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)/download")!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validate(response, data: data)
        return data
    }

    // MARK: - Delete

    /// Doar snapshot-urile manuale (`auto == false`) pot fi sterse.
    func deleteSnapshot(id: String) async throws {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)")!, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validate(response, data: data)
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

    /// Orice 2xx e succes: create raspunde 201, restore/delete 200, iar
    /// download-ul e un stream — nu picam pe codul exact de succes.
    private func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.unknown("Raspuns invalid")
        }
        guard (200...299).contains(http.statusCode) else {
            throw APIError.from(data: data, statusCode: http.statusCode)
        }
    }
}
