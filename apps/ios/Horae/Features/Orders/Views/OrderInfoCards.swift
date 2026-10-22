import SwiftUI

// MARK: - Predare

/// Predare card: mode indicator (Ridicare / Livrare) + Când / De la or
/// Adresă / Client / Livrator rows. The mode is set when the order is
/// created (the update API has no fulfilment field), so the segmented
/// control shows the current mode and is not tappable.
struct OrderHandoverCard: View {
    let order: OrderResponse
    let pickupLocation: LocationResponse?

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 10) {
                OrderCardTitle("Predare") { modeIndicator }
                Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 10, verticalSpacing: 6) {
                    row("Când", order.dueFull ?? "Fără termen")
                    if let method = order.deliveryMethodLabel {
                        row("Metodă", method)
                    }
                    if order.isPickup {
                        if let pickupText { row("De la", pickupText) }
                    } else {
                        // Site orders carry the shop method as their point — shown once, as "Metodă".
                        if let point = order.meaningfulDeliveryPoint, point != order.meaningfulDeliveryMethod {
                            row("Către", point)
                        }
                        if let address = order.deliveryAddress, !address.isEmpty {
                            row("Adresă", address)
                        }
                    }
                    if let customer = order.customerName, !customer.isEmpty {
                        row("Client", customer)
                    }
                    if let assignee = order.assignedTo {
                        row("Livrator", assignee.fullName)
                    }
                }
            }
        }
    }

    private var pickupText: String? {
        guard let pickupLocation else { return order.meaningfulDeliveryPoint }
        return pickupLocation.address.isEmpty
            ? pickupLocation.name : "\(pickupLocation.name), \(pickupLocation.address)"
    }

    private func row(_ label: String, _ value: String) -> some View {
        GridRow {
            Text(label)
                .font(AppFont.body(13))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .gridColumnAlignment(.leading)
            Text(value)
                .font(AppFont.body(13, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.label)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
        .accessibilityElement(children: .combine)
    }

    private var modeIndicator: some View {
        HStack(spacing: 2) {
            segment("Ridicare", isOn: order.isPickup)
            segment("Livrare", isOn: !order.isPickup)
        }
        .padding(3)
        .background(AppTheme.Colors.border.opacity(0.7), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Mod de predare: \(order.modeTitle)")
        .help("Modul de predare se alege la crearea comenzii")
    }

    private func segment(_ title: String, isOn: Bool) -> some View {
        Text(title)
            .font(AppFont.body(12, weight: .bold))
            .foregroundStyle(isOn ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel)
            .padding(.horizontal, 10)
            .frame(minHeight: 30)
            .background {
                if isOn {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(AppTheme.Colors.card)
                        .shadow(color: AppTheme.Colors.label.opacity(0.12), radius: 1, y: 1)
                }
            }
    }
}

// MARK: - Note

struct OrderNotesCard: View {
    let notes: String

    /// Older imports carry the importer's English marker; show it in Romanian.
    private var displayNotes: String {
        notes.replacingOccurrences(of: "Termen (needs review):", with: "Termen de verificat:")
    }

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 6) {
                OrderCardTitle("Note")
                Text(displayNotes)
                    .font(AppFont.body(13))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineSpacing(3)
                    .textSelection(.enabled)
            }
        }
    }
}

// MARK: - Istoric

/// Istoric card, rebuilt from the order's own timestamps (created, delivery
/// note generated/signed, completed) — there is no separate audit feed.
struct OrderHistoryCard: View {
    let order: OrderResponse

    private struct Entry: Identifiable {
        let id = UUID()
        let date: Date
        let what: String
        let who: String?
    }

    private var entries: [Entry] {
        var list = [Entry(
            date: order.createdAt,
            what: order.isFromSite ? "Plasată pe site" : "Creată",
            who: order.isFromSite ? "WooCommerce" : order.createdBy.fullName)]
        if let note = order.deliveryNote {
            list.append(Entry(date: note.generatedAt, what: "Aviz generat", who: note.serialNumber.map { "seria \($0)" }))
            if let signedAt = note.signedAt {
                list.append(Entry(date: signedAt, what: "Semnat la predare", who: note.signedByName))
            }
        }
        if let completedAt = order.completedAt {
            list.append(Entry(date: completedAt, what: order.status == .ANULATA ? "Anulată" : "Livrată", who: nil))
        } else if order.updatedAt.timeIntervalSince(order.createdAt) > 60 {
            list.append(Entry(date: order.updatedAt, what: "Ultima modificare", who: order.status.displayName))
        }
        return list.sorted { $0.date < $1.date }
    }

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 8) {
                OrderCardTitle("Istoric")
                ForEach(entries) { entry in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(OrderFormat.time(entry.date))
                                .font(AppFont.display(14))
                                .monospacedDigit()
                            if !RoDate.calendar.isDateInToday(entry.date) {
                                Text(OrderFormat.dayMonth(entry.date))
                                    .font(AppFont.body(11))
                                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            }
                        }
                        .frame(minWidth: 48, alignment: .leading)
                        (Text(entry.what).font(AppFont.body(12, weight: .semibold))
                            + Text(entry.who.map { " · \($0)" } ?? "")
                            .font(AppFont.body(12))
                            .foregroundColor(AppTheme.Colors.secondaryLabel))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .foregroundStyle(AppTheme.Colors.label)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

#Preview("Info cards") {
    ScrollView {
        VStack(spacing: 12) {
            if let order = OrderPreviewData.orders.first {
                OrderHandoverCard(order: order, pickupLocation: nil)
                OrderNotesCard(notes: order.notes ?? "")
                OrderHistoryCard(order: order)
            }
        }
        .padding()
    }
    .background(AppTheme.Colors.appBackground)
}
