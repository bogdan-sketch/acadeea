import SwiftUI

/// Order card of the list. Lines in the owner's priority order: product,
/// ordered quantity, customer. The order number is irrelevant to the team
/// and only shows on the detail page (and still matches in search).
/// Then the delivery line (shop method or mode + due day); the status pill
/// stays on the right.
struct OrderListRow: View {
    let order: OrderResponse

    var body: some View {
        HStack(spacing: 12) {
            OrderRowLines(order: order)
                .frame(maxWidth: .infinity, alignment: .leading)

            OrderStatusBadge(order.status)
                .layoutPriority(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.Colors.card, in: shape)
        .overlay(shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
        .contentShape(shape)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(order.rowAccessibilityText)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
    }
}

/// The three text lines of an order row — shared by the Comenzi list and the
/// Panou "Comenzile de azi" card.
struct OrderRowLines: View {
    let order: OrderResponse
    var productSize: CGFloat = 15

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(order.productNamesLine)
                .font(AppFont.body(productSize, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            if let quantities = order.quantitiesLine {
                Text(quantities)
                    .font(AppFont.body(12, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .lineLimit(1)
            }
            if let customer = order.rowCustomer {
                Text(customer)
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(1)
            }
            if let delivery = order.rowDelivery {
                Label(delivery, systemImage: order.isPickup ? "bag" : "shippingbox")
                    .labelStyle(.titleAndIcon)
                    .font(AppFont.body(12))
                    .foregroundStyle(order.isOverdue ? AppTheme.Status.fg(.danger) : AppTheme.Colors.secondaryLabel)
                    .lineLimit(1)
            }
        }
    }
}

extension OrderResponse {
    /// VoiceOver text in the same order as the row lines.
    var rowAccessibilityText: String {
        var parts = [productNamesLine]
        if let quantitiesLine { parts.append(quantitiesLine) }
        if let rowCustomer { parts.append(rowCustomer) }
        if let rowDelivery { parts.append(rowDelivery) }
        parts.append(status.displayName)
        return parts.joined(separator: ", ")
    }
}

#Preview("OrderListRow") {
    VStack(spacing: 8) {
        ForEach(OrderPreviewData.orders) { OrderListRow(order: $0) }
    }
    .padding()
    .background(AppTheme.Colors.appBackground)
}
