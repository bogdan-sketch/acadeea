import SwiftUI

/// Task priority marker: one triangle shape for every level, differentiated by
/// color (1 albastru → 5 rosu, same scale as PriorityPicker) AND the level
/// digit inside the triangle so P1–P5 read at a glance. Priority 0 renders
/// nothing — call sites may skip it themselves too.
struct PriorityBadge: View {
    let priority: Int

    var body: some View {
        if priority > 0 {
            ZStack {
                Image(systemName: "triangle.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(PriorityBadge.color(for: priority))
                Text("\(priority)")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    // Yellow is too light for a white digit.
                    .foregroundStyle(priority == 3 ? Color.black : .white)
                    // Optical center of a triangle sits below its geometric one.
                    .offset(y: 3)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Prioritate \(priority)")
        }
    }

    /// Shared priority scale (mirrors PriorityPicker + web priority-badge).
    static func color(for level: Int) -> Color {
        switch level {
        case 1: .blue
        case 2: .green
        case 3: .yellow
        case 4: .orange
        case 5: .red
        default: .gray
        }
    }
}

#Preview {
    HStack(spacing: 12) {
        ForEach(1...5, id: \.self) { PriorityBadge(priority: $0) }
    }
    .padding()
}
