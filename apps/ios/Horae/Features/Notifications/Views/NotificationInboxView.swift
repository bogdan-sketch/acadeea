import SwiftUI

/// In-app notifications inbox: a paginated list (newest first). Tapping an
/// unread notification marks it read; a toolbar action marks all read.
struct NotificationInboxView: View {
    @State private var viewModel = NotificationInboxViewModel()

    var body: some View {
        Group {
            if viewModel.notifications.isEmpty && viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.notifications.isEmpty {
                ContentUnavailableView(
                    "Nicio notificare",
                    systemImage: "bell.slash",
                    description: Text("Nu ai notificari deocamdata.")
                )
            } else {
                List {
                    ForEach(Array(viewModel.notifications.enumerated()), id: \.element.id) { index, notification in
                        Button {
                            Task { await viewModel.markRead(notification) }
                        } label: {
                            NotificationRow(notification: notification)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowSeparator(.hidden)
                        .onAppear {
                            if index >= viewModel.notifications.count - 5 {
                                Task { await viewModel.loadMore() }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Notificari")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Marcheaza toate ca citite") {
                    Task { await viewModel.markAllRead() }
                }
                .font(.subheadline)
                .disabled(!viewModel.hasUnread)
            }
        }
        .refreshable { await Task { await viewModel.refresh() }.value }
        .task {
            await viewModel.loadNotifications(reset: true)
            await viewModel.loadUnreadCount()
        }
        .errorAlert($viewModel.error)
    }
}

// MARK: - Row

private struct NotificationRow: View {
    let notification: NotificationResponse

    var body: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
            // Unread indicator + type icon.
            ZStack(alignment: .topLeading) {
                Image(systemName: notification.icon)
                    .font(.title3)
                    .foregroundStyle(notification.isRead ? Color.secondary : AppTheme.Colors.primary)
                    .frame(width: 28)
                if !notification.isRead {
                    Circle()
                        .fill(AppTheme.Colors.primary)
                        .frame(width: 8, height: 8)
                        .offset(x: -4, y: -2)
                        .accessibilityHidden(true)
                }
            }

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(notification.title)
                    .font(.subheadline.weight(notification.isRead ? .regular : .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                if !notification.body.isEmpty {
                    Text(notification.body)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
            }

            Spacer(minLength: AppTheme.Spacing.sm)

            Text(notification.createdAt.relativeString)
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, AppTheme.Spacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(notification.isRead ? "Citit" : "Necitit"). \(notification.title). \(notification.body)"
        )
    }
}

#Preview {
    NavigationStack {
        NotificationInboxView()
    }
}
