import SwiftUI

/// Card title of the order detail sections (DM Sans 15 bold).
struct OrderCardTitle<Trailing: View>: View {
    private let title: String
    private let trailing: Trailing

    init(_ title: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .center) {
            Text(title)
                .font(AppFont.body(15, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            trailing
        }
    }
}

/// Produse card: one row per line item, separated by hairlines.
struct OrderItemsCard: View {
    let items: [OrderItemResponse]

    var body: some View {
        HCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                OrderCardTitle("Produse") {
                    Text(OrderFormat.productCount(items.count))
                        .font(AppFont.body(12, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 8)
                ForEach(items) { item in
                    Divider().overlay(AppTheme.Colors.border)
                    OrderItemRow(item: item)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                }
            }
        }
    }
}

/// Line item: initial tile, name, quantity + notes, item status chip, big ×qty.
struct OrderItemRow: View {
    let item: OrderItemResponse

    var body: some View {
        HStack(spacing: 12) {
            Text(initial)
                .font(AppFont.title(20))
                .foregroundStyle(AppTheme.Colors.label)
                .frame(width: 44, height: 44)
                .background(AppTheme.Colors.primary.opacity(0.14),
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.recipeName)
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                Text(subtitle)
                    .font(AppFont.body(11))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                OrderStatusBadge(item.status)
                    .padding(.top, 3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(quantityBig)
                .font(AppFont.display(20))
                .foregroundStyle(AppTheme.Colors.label)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .accessibilityElement(children: .combine)
    }

    private var initial: String {
        item.recipeName.first.map { String($0).uppercased() } ?? "?"
    }

    private var isPieces: Bool { item.unit == .BUCATI }

    private var quantityBig: String {
        isPieces ? "×\(item.quantity.qtyFormatted)" : item.unit.formatQty(item.quantity)
    }

    /// "1 buc · „La mulți ani, Ioana!”"
    private var subtitle: String {
        var parts = [item.unit.formatQty(item.quantity)]
        if let notes = item.notes, !notes.isEmpty { parts.append("„\(notes)”") }
        return parts.joined(separator: " · ")
    }
}

#Preview("OrderItemsCard") {
    OrderItemsCard(items: OrderPreviewData.orders.flatMap(\.items))
        .padding()
        .background(AppTheme.Colors.appBackground)
}
