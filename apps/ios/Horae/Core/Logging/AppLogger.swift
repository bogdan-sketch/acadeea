import Foundation
import OSLog

/// File-based logger. Writes to Documents/acadeea_logs/ folder.
/// Read logs: open Files app → On My iPhone → Horae → acadeea_logs/
/// Or from terminal: `xcrun simctl get_app_container booted dev.tigan.acadeea data`
final class AppLogger: @unchecked Sendable {
    static let shared = AppLogger()

    private let logger = Logger(subsystem: "dev.tigan.acadeea", category: "App")
    private let logFileURL: URL
    private let queue = DispatchQueue(label: "dev.tigan.acadeea.logger")

    private init() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let logsDir = docs.appendingPathComponent("acadeea_logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: logsDir, withIntermediateDirectories: true)

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let fileName = "log_\(formatter.string(from: Date())).txt"
        logFileURL = logsDir.appendingPathComponent(fileName)

        // Create file if not exists
        if !FileManager.default.fileExists(atPath: logFileURL.path) {
            FileManager.default.createFile(atPath: logFileURL.path, contents: nil)
        }

        log("=== App started ===")
        log("Log file: \(logFileURL.path)")
    }

    func log(_ message: String, level: LogLevel = .info, file: String = #file, line: Int = #line) {
        let fileName = (file as NSString).lastPathComponent
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let entry = "[\(timestamp)] [\(level.rawValue)] [\(fileName):\(line)] \(message)\n"

        // Console
        switch level {
        case .debug: logger.debug("\(message)")
        case .info: logger.info("\(message)")
        case .warning: logger.warning("\(message)")
        case .error: logger.error("\(message)")
        }

        // File
        queue.async { [weak self] in
            guard let self, let handle = FileHandle(forWritingAtPath: logFileURL.path) else { return }
            handle.seekToEndOfFile()
            handle.write(entry.data(using: .utf8) ?? Data())
            handle.closeFile()
        }
    }

    /// Read all logs from today's file
    func readLogs() -> String {
        (try? String(contentsOf: logFileURL, encoding: .utf8)) ?? "(no logs)"
    }

    /// Path to logs directory for debugging
    var logsDirectoryPath: String {
        logFileURL.deletingLastPathComponent().path
    }

    enum LogLevel: String {
        case debug = "DEBUG"
        case info = "INFO"
        case warning = "WARN"
        case error = "ERROR"
    }
}
