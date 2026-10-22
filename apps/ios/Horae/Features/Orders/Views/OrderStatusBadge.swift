import SwiftUI

/// Status pill for orders and order items: `HStatusChip` in the fixed status
/// palette, plus a neutral variant (muted ink on a border wash) for the
/// finished states the palette has no kind for (Livrată / Livrat).
struct OrderStatusBadge: View {
    private let title: String
    private let kind: AppTheme.Status.Kind?

    init(_ status: OrderStatus) {
        title = status.displayName
        kind = status.kind
    }

    init(_ status: OrderItemStatus) {
        title = status.displayName
        kind = status.kind
    }

    var body: some View {
        if let kind {
            HStatusChip(title, kind: kind)
        } else {
            HStack(spacing: 5) {
                Circle()
                    .fill(AppTheme.Colors.secondaryLabel)
                    .frame(width: 6, height: 6)
                    .accessibilityHidden(true)
                Text(title)
                    .font(AppFont.body(11, weight: .bold))
                    .lineLimit(1)
            }
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(AppTheme.Colors.border, in: Capsule())
        }
    }
}

#Preview("OrderStatusBadge") {
    VStack(alignment: .leading, spacing: 8) {
        ForEach(OrderStatus.allCases) { OrderStatusBadge($0) }
    }
    .padding()
    .background(AppTheme.Colors.card)
}
