import SwiftUI

struct LowStockAlertBanner: View {
    let items: [LowStockItem]
    var onTap: (() -> Void)?

    var body: some View {
        if !items.isEmpty {
            Button(action: { onTap?() }) {
                HStack(spacing: AppTheme.Spacing.sm) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.white)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(items.count) materiale sub stoc minim")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                        Text(items.prefix(3).map(\.title).joined(separator: ", "))
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.8))
                            .lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.6))
                }
                .padding()
                .background(.red.gradient, in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
            }
            .buttonStyle(.plain)
        }
    }
}

#Preview {
    LowStockAlertBanner(items: [
        LowStockItem(id: "1", title: "Făină", type: "raw_material", currentStock: 2, minimumStock: 10, unit: "KILOGRAME"),
        LowStockItem(id: "2", title: "Zahar", type: "raw_material", currentStock: 0, minimumStock: 5, unit: "KILOGRAME"),
    ])
    .padding()
}
