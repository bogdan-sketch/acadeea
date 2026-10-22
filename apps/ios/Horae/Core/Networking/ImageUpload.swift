import Foundation
import ImageIO
import UniformTypeIdentifiers

// MARK: - Relative API paths

extension APIClient {
    /// Resolves an image/file path returned by the API. The server sends
    /// RELATIVE paths (`/api/v1/images/<uuid>`) that must be prefixed with the
    /// API host; absolute URLs (legacy / external) are returned unchanged.
    static func absoluteURL(for path: String?) -> URL? {
        guard let path = path?.trimmingCharacters(in: .whitespacesAndNewlines), !path.isEmpty else {
            return nil
        }
        if path.hasPrefix("http://") || path.hasPrefix("https://") {
            return URL(string: path)
        }
        let base = baseURL.hasSuffix("/") ? String(baseURL.dropLast()) : baseURL
        let suffix = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: base + suffix)
    }
}

// MARK: - Prepared upload

/// An image ready to be sent as one multipart file part.
struct ImageUploadPayload: Sendable {
    let data: Data
    let filename: String
    let mime: String
}

enum ImageUploadPreparer {
    /// Longest side after on-device downscaling. The server re-encodes to WebP
    /// anyway; this keeps a 50 MB camera photo small and fast on mobile data.
    static let maxPixelSize = 2000
    static let jpegQuality = 0.9

    /// Downscales to `maxPixelSize` on the long side and re-encodes as JPEG
    /// (orientation baked in). Falls back to the original bytes when ImageIO
    /// cannot decode the data (the server still validates the file).
    static func prepare(_ original: Data) -> ImageUploadPayload {
        guard let source = CGImageSourceCreateWithData(original as CFData, nil) else {
            return ImageUploadPayload(data: original, filename: "photo", mime: "application/octet-stream")
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return ImageUploadPayload(data: original, filename: "photo", mime: "application/octet-stream")
        }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output as CFMutableData, UTType.jpeg.identifier as CFString, 1, nil
        ) else {
            return ImageUploadPayload(data: original, filename: "photo", mime: "application/octet-stream")
        }
        let props: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: jpegQuality]
        CGImageDestinationAddImage(destination, image, props as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            return ImageUploadPayload(data: original, filename: "photo", mime: "application/octet-stream")
        }
        return ImageUploadPayload(data: output as Data, filename: "photo.jpg", mime: "image/jpeg")
    }
}

// MARK: - Multipart

enum MultipartImageRequest {
    /// Builds an authenticated `multipart/form-data` POST with a single file part.
    static func make(url: URL, field: String, data: Data, filename: String, mime: String) -> URLRequest {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.timeoutInterval = 120

        let safeName = filename.replacingOccurrences(of: "\"", with: "")
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"\(field)\"; filename=\"\(safeName)\"\r\n".utf8))
        body.append(Data("Content-Type: \(mime)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        request.httpBody = body
        return request
    }

    /// Accepts any 2xx (Nest returns 201 for POST, 200 for DELETE).
    static func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard (200...299).contains(http.statusCode) else {
            throw APIError.from(data: data, statusCode: http.statusCode)
        }
    }
}
