import Foundation
import SocketIO
import Observation

/// Manages Socket.IO connection for real-time updates.
/// Connects to /ws namespace with JWT auth handshake.
/// Events: task:update, stock:update, stock:low
@Observable
final class WebSocketManager {
    static let shared = WebSocketManager()

    var isConnected = false

    // Event callbacks
    var onTaskUpdate: ((TaskUpdateEvent) -> Void)?
    var onStockUpdate: ((StockUpdateEvent) -> Void)?
    var onLowStockAlert: ((StockUpdateEvent) -> Void)?
    var onActivityEvent: ((ActivityResponse) -> Void)?

    private var manager: SocketManager?
    private var socket: SocketIOClient?

    private init() {}

    // MARK: - Connect

    func connect() {
        guard let token = KeychainService.shared.accessToken else { return }

        let url = URL(string: AppConfig.baseURL)!
        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .forceWebsockets(true),
            .connectParams(["token": token]),
            .path("/ws/socket.io"),
        ])

        socket = manager?.socket(forNamespace: "/ws")

        setupEventHandlers()
        socket?.connect()
    }

    // MARK: - Disconnect

    func disconnect() {
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
    }

    // MARK: - Reconnect (e.g. after token refresh)

    func reconnect() {
        disconnect()
        connect()
    }

    // MARK: - Join Rooms

    func joinRoom(_ room: String) {
        socket?.emit("join", room)
    }

    // MARK: - Event Handlers

    private func setupEventHandlers() {
        socket?.on(clientEvent: .connect) { [weak self] _, _ in
            self?.isConnected = true

            // Auto-join relevant rooms
            self?.joinRoom("tasks")
            self?.joinRoom("stock")

            if let slug = AuthManager.shared.currentUser?.role.slug {
                self?.joinRoom("role:\(slug)")
            }
        }

        socket?.on(clientEvent: .disconnect) { [weak self] _, _ in
            self?.isConnected = false
        }

        socket?.on("task:update") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let jsonData = try? JSONSerialization.data(withJSONObject: dict) else { return }

            if let event = try? JSONDecoder().decode(TaskUpdateEvent.self, from: jsonData) {
                self?.onTaskUpdate?(event)
            }
        }

        socket?.on("stock:update") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let jsonData = try? JSONSerialization.data(withJSONObject: dict) else { return }

            if let event = try? JSONDecoder().decode(StockUpdateEvent.self, from: jsonData) {
                self?.onStockUpdate?(event)
            }
        }

        socket?.on("stock:low") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let jsonData = try? JSONSerialization.data(withJSONObject: dict) else { return }

            if let event = try? JSONDecoder().decode(StockUpdateEvent.self, from: jsonData) {
                self?.onLowStockAlert?(event)
            }
        }

        socket?.on("activity:new") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let jsonData = try? JSONSerialization.data(withJSONObject: dict) else { return }

            let decoder = APIClient.makeDecoder()
            if let event = try? decoder.decode(ActivityResponse.self, from: jsonData) {
                self?.onActivityEvent?(event)
            }
        }
    }
}

// MARK: - Event Models

struct TaskUpdateEvent: Decodable {
    let taskId: String
}

struct StockUpdateEvent: Decodable {
    let materialId: String
}
