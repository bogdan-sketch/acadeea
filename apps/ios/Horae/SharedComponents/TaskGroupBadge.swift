import SwiftUI

/// Discreet capsule naming the family (batch) a task was created in — the
/// `groupLabel` stamped by `POST /tasks/multi`. Neutral grey so it never
/// competes with the coloured status/priority markers next to it; renders
/// nothing when the task has no label.
struct TaskGroupBadge: View {
    let label: String?

    var body: some View {
        if let label, !label.isEmpty {
            Text(label)
                .font(.caption2.weight(.medium))
                .lineLimit(1)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color(.systemGray5))
                .foregroundStyle(.secondary)
                .clipShape(Capsule())
                .accessibilityLabel("Grup \(label)")
        }
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 12) {
        TaskGroupBadge(label: "Comanda botez")
        TaskGroupBadge(label: nil)
        HStack(spacing: 6) {
            PriorityBadge(priority: 3)
            TaskGroupBadge(label: "Sosuri inghetata")
        }
    }
    .padding()
}
