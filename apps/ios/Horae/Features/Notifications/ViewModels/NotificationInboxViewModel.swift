import Foundation
import Observation

@Observable
final class NotificationInboxViewModel {
    var notifications: [NotificationResponse] = []
    var unreadCount = 0
    var isLoading = false
    var hasNextPage = false
    var error: APIError?

    private var currentPage = 1
    private let service = NotificationService.shared

    var hasUnread: Bool { unreadCount > 0 }

    // MARK: - Loading

    func loadNotifications(reset: Bool = false) async {
        if reset { currentPage = 1 }
        isLoading = true
        defer { isLoading = false }

        do {
            let result = try await service.fetchNotifications(
                query: NotificationQuery(page: currentPage, limit: 20)
            )
            if reset {
                notifications = result.data
            } else {
                notifications.append(contentsOf: result.data)
            }
            hasNextPage = currentPage < result.totalPages
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func loadMore() async {
        guard hasNextPage, !isLoading else { return }
        currentPage += 1
        await loadNotifications()
    }

    func refresh() async {
        await loadNotifications(reset: true)
        await loadUnreadCount()
    }

    /// Best-effort unread badge count — failures leave the last value.
    func loadUnreadCount() async {
        if let count = try? await service.fetchUnreadCount() {
            unreadCount = count
        }
    }

    // MARK: - Mutations

    /// Mark one notification read, optimistically updating the row + badge.
    func markRead(_ notification: NotificationResponse) async {
        guard !notification.isRead else { return }
        do {
            try await service.markRead(id: notification.id)
            applyRead(id: notification.id)
            unreadCount = max(0, unreadCount - 1)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Mark everything read.
    func markAllRead() async {
        guard hasUnread else { return }
        do {
            try await service.markAllRead()
            let now = Date()
            notifications = notifications.map { $0.markingRead(at: now) }
            unreadCount = 0
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    private func applyRead(id: String) {
        let now = Date()
        notifications = notifications.map { $0.id == id ? $0.markingRead(at: now) : $0 }
    }
}

private extension NotificationResponse {
    /// Returns a copy flagged as read at `date` (client-side optimistic update).
    func markingRead(at date: Date) -> NotificationResponse {
        guard readAt == nil else { return self }
        return NotificationResponse(copy: self, readAt: date)
    }
}

extension NotificationResponse {
    /// Memberwise copy used for optimistic read updates (the primary initializer
    /// is a decoder init, so there is no synthesized memberwise one).
    fileprivate init(copy other: NotificationResponse, readAt: Date?) {
        self.id = other.id
        self.type = other.type
        self.title = other.title
        self.body = other.body
        self.readAt = readAt
        self.createdAt = other.createdAt
    }
}
