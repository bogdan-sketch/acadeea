import SwiftUI

struct StockLevelBar: View {
    let current: Double
    let minimum: Double
    let unit: String

    private var percentage: Double {
        guard minimum > 0 else { return 1 }
        return min(current / minimum, 1)
    }

    private var barColor: Color {
        if percentage <= 0 { return .red }
        if percentage <= 0.3 { return .red }
        if percentage <= 0.6 { return .orange }
        return .green
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("\(String(format: "%.0f", current)) / \(String(format: "%.0f", minimum)) \(unit)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(Int(percentage * 100))%")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(barColor)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray5))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(barColor)
                        .frame(width: max(0, geo.size.width * percentage))
                }
            }
            .frame(height: 8)
        }
    }
}

#Preview {
    VStack(spacing: 20) {
        StockLevelBar(current: 8, minimum: 10, unit: "kg")
        StockLevelBar(current: 2, minimum: 10, unit: "kg")
        StockLevelBar(current: 0, minimum: 5, unit: "kg")
    }
    .padding()
}
