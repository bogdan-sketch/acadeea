import SwiftUI
import Observation

/// App-wide confirmation banners: after a main action (receptie, transfer,
/// ajustare) a short success toast confirms the action ran and summarizes its
/// effect. Shown from the root overlay so it survives sheet dismissals.
@Observable
final class ToastCenter {
    static let shared = ToastCenter()

    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let title: String
        let lines: [String]
    }

    var current: Toast?

    private var dismissTask: Task<Void, Never>?

    @MainActor
    func show(_ title: String, lines: [String] = []) {
        dismissTask?.cancel()
        withAnimation(.spring(duration: 0.3)) {
            current = Toast(title: title, lines: lines)
        }
        // These toasts are the only confirmation for main actions and auto-dismiss,
        // so speak them for VoiceOver users who can't see the transient banner.
        let spoken = lines.isEmpty ? title : title + ". " + lines.joined(separator: ", ")
        AccessibilityNotification.Announcement(spoken).post()
        dismissTask = Task { [weak self] in
            // Longer summaries get a bit more reading time.
            try? await Task.sleep(for: .seconds(lines.isEmpty ? 3 : 5))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                withAnimation(.easeOut(duration: 0.25)) { self?.current = nil }
            }
        }
    }
}

/// Root-level overlay that renders the current toast as a top banner.
struct ToastOverlay: ViewModifier {
    @State private var center = ToastCenter.shared

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let toast = center.current {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text(toast.title)
                            .font(.subheadline.weight(.semibold))
                    }
                    ForEach(toast.lines, id: \.self) { line in
                        Text(line)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.leading, 28)
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(Color.green.opacity(0.35), lineWidth: 1)
                )
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.top, AppTheme.Spacing.xs)
                .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
                .transition(.move(edge: .top).combined(with: .opacity))
                .onTapGesture {
                    withAnimation { center.current = nil }
                }
                .zIndex(999)
            }
        }
    }
}

extension View {
    /// Attach ONCE at the app root (AppTabView).
    func toastOverlay() -> some View { modifier(ToastOverlay()) }
}
