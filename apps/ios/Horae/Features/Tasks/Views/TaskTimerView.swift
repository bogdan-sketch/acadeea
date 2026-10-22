import SwiftUI

/// Live elapsed-time badge for IN_LUCRU tasks.
/// Uses TimelineView for 1-second updates.
struct TaskTimerView: View {
    let startedAt: Date

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1.0)) { context in
            let elapsed = context.date.timeIntervalSince(startedAt)
            Text(formatElapsed(elapsed))
                .font(.caption.monospacedDigit().bold())
                .padding(.horizontal, AppTheme.Spacing.sm)
                .padding(.vertical, AppTheme.Spacing.xxs)
                .background(Color.orange.opacity(0.15))
                .foregroundStyle(.orange)
                .clipShape(Capsule())
        }
    }

    private func formatElapsed(_ interval: TimeInterval) -> String {
        let total = max(0, Int(interval))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60

        if hours > 0 {
            return "\(hours)h \(String(format: "%02d", minutes))m"
        }
        return "\(String(format: "%02d", minutes)):\(String(format: "%02d", seconds))"
    }
}
