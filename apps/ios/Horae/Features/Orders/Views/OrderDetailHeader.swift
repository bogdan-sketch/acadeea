import SwiftUI

/// Top of the order detail: source eyebrow (accent), Fraunces title = what
/// was ordered, customer · small muted "Comanda 11644", meta line ("Ridicare azi, 11:30 · Cofetărie Napoca · 1 produs").
struct OrderDetailHeader: View {
    let order: OrderResponse
    let pickupLocation: LocationResponse?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(eyebrow)
                .font(AppFont.body(12, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.primaryText)
            Text(order.productsLine)
                .font(AppFont.title(26))
                .tracking(-0.3)
                .foregroundStyle(AppTheme.Colors.label)
                .accessibilityAddTraits(.isHeader)
            Text("\(customerText)\(numberText)")
            Text(meta)
                .font(AppFont.body(12))
                .foregroundStyle(order.isOverdue ? AppTheme.Status.fg(.danger) : AppTheme.Colors.secondaryLabel)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
        .accessibilityElement(children: .combine)
    }

    private var customerText: Text {
        Text(order.displayCustomer)
            .font(AppFont.body(15, weight: .semibold))
            .foregroundStyle(AppTheme.Colors.label)
    }

    /// The only place the number shows in the app (besides the printed aviz).
    private var numberText: Text {
        Text("\(order.displayCustomer.isEmpty ? "" : " · ")Comanda \(order.displayNumber)")
            .font(AppFont.body(12))
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
    }

    private var eyebrow: String {
        let placed = OrderFormat.relative(order.createdAt)
        if order.isFromSite {
            return "Site · WooCommerce · plasată \(placed)"
        }
        return "Creată de \(order.createdBy.fullName) · \(placed)"
    }

    private var meta: String {
        var parts: [String] = []
        if let due = order.dueRelative {
            parts.append("\(order.modeTitle) \(due)\(order.isOverdue ? " · întârziată" : "")")
        } else {
            parts.append("\(order.modeTitle) · fără termen")
        }
        if let place = order.isPickup ? (pickupLocation?.name ?? order.displayDeliveryPoint) : order.displayDeliveryPoint {
            parts.append(place)
        }
        parts.append(OrderFormat.productCount(order.itemCount))
        return parts.joined(separator: " · ")
    }
}

// MARK: - Stepper

/// 5-step status track (Nouă → Livrată). Done steps get a green bar, the
/// current one an accent bar + accent-wash tile. A cancelled order shows the
/// track greyed out under a danger banner.
struct OrderStatusStepper: View {
    let status: OrderStatus
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var currentIndex: Int? { OrderStatus.lifecycle.firstIndex(of: status) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if status == .ANULATA {
                Label("Comandă anulată", systemImage: "nosign")
                    .font(AppFont.body(12, weight: .bold))
                    .foregroundStyle(AppTheme.Status.fg(.danger))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(AppTheme.Status.bg(.danger), in: Capsule())
            }
            // Equal-height tiles: the row sizes to the tallest label and every
            // tile stretches to it, so a wrapped label never staggers the track.
            HStack(alignment: .top, spacing: 4) {
                ForEach(Array(OrderStatus.lifecycle.enumerated()), id: \.offset) { index, step in
                    stepTile(step, index: index)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .opacity(status == .ANULATA ? 0.5 : 1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Stare comandă: \(status.displayName)")
        .accessibilityValue(currentIndex.map { "pasul \($0 + 1) din \(OrderStatus.lifecycle.count)" } ?? "")
    }

    private func stepTile(_ step: OrderStatus, index: Int) -> some View {
        let isDone = currentIndex.map { index < $0 } ?? false
        let isCurrent = index == currentIndex
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        return VStack(alignment: .leading, spacing: 6) {
            Capsule()
                .fill(isDone ? AppTheme.Status.fg(.ready) : isCurrent ? AppTheme.Colors.primary : AppTheme.Colors.border)
                .frame(height: 4)
            Text(step.displayName)
                .font(AppFont.body(11, weight: .bold))
                .foregroundStyle(isDone || isCurrent ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel)
                // One line ("În pregătire", never "În / pregătire"): shrinks to
                // fit the narrow tile; only accessibility sizes may wrap.
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
                .minimumScaleFactor(0.6)
                .allowsTightening(true)
        }
        .padding(.horizontal, 4)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(isCurrent ? AppTheme.Colors.primary.opacity(0.1) : AppTheme.Colors.card, in: shape)
        .overlay(shape.strokeBorder(isCurrent ? AppTheme.Colors.primary : AppTheme.Colors.border, lineWidth: 1))
    }
}

#Preview("Header + stepper") {
    VStack(alignment: .leading, spacing: 12) {
        if let order = OrderPreviewData.orders.first {
            OrderDetailHeader(order: order, pickupLocation: nil)
            OrderStatusStepper(status: order.status)
        }
        OrderStatusStepper(status: .ANULATA)
    }
    .padding()
    .background(AppTheme.Colors.appBackground)
}
