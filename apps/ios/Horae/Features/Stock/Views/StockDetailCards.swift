import SwiftUI
import Charts

// Cards of the redesigned material / consumable detail screens.

// MARK: - Header

/// Eyebrow, Fraunces title, status + category chips and a muted meta line.
/// `onCategoryTap` makes the category chip a chooser (nil = read-only).
struct StockDetailHeader: View {
    let eyebrow: String
    let title: String
    let status: MaterialStatus
    let category: String?
    let meta: String?
    var onCategoryTap: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(eyebrow)
                .font(AppFont.body(12, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.primaryText)
            Text(title)
                .font(AppFont.title(26))
                .tracking(-0.3)
                .foregroundStyle(AppTheme.Colors.label)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
            StockFlowLayout(spacing: 6) {
                StockStatusPill(status: status)
                categoryChip
            }
            if let meta, !meta.isEmpty {
                Text(meta)
                    .font(AppFont.body(13))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private var categoryChip: some View {
        let text = category ?? StockText.noCategory
        if let onCategoryTap {
            Button(action: onCategoryTap) {
                HStack(spacing: 4) {
                    Text(text)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 9, weight: .bold))
                        .accessibilityHidden(true)
                }
                .font(AppFont.body(11, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 10)
                .padding(.vertical, 3)
                .overlay(Capsule().strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                .contentShape(.interaction, Rectangle().inset(by: -12))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Categorie: \(text)")
            .accessibilityHint("Schimbă categoria")
            .help("Schimbă categoria")
        } else {
            NeutralPill(title: text)
        }
    }
}

// MARK: - Stock levels

struct StockLevel: Identifiable {
    let label: String
    let value: String
    var tone: AppTheme.Status.Kind?
    var id: String { label }
}

/// "În stoc" always; the other figures only when non-zero (zero rows read as
/// real stock and confuse).
struct StockLevelsCard: View {
    let levels: [StockLevel]

    var body: some View {
        HCard(padding: 16) {
            StockFlowLayout(spacing: 28) {
                ForEach(levels) { level in
                    StockMiniStat(label: level.label, value: level.value, tone: level.tone)
                }
            }
        }
    }
}

// MARK: - Per location

struct StockLocationsCard: View {
    let locations: [ItemLocationStock]
    let format: (Double) -> String

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 8) {
                StockCardTitle("Stoc pe locații")
                ForEach(Array(locations.enumerated()), id: \.element.id) { index, location in
                    if index > 0 { StockDivider() }
                    StockInfoRow(location.locationName) {
                        if location.reservedCount > 0 {
                            Text("\(format(location.quantity)) · rezervat \(format(location.reservedCount))")
                        } else {
                            Text(format(location.quantity))
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Price history

struct StockPriceHistoryCard: View {
    let entries: [PriceHistoryEntry]
    let currentPrice: String?

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 10) {
                StockCardTitle("Istoric preț") {
                    if let currentPrice {
                        Text(currentPrice)
                            .font(AppFont.body(13, weight: .bold))
                            .foregroundStyle(AppTheme.Colors.primaryText)
                    }
                }
                if entries.count >= 2 {
                    chart
                }
                ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                    if index > 0 { StockDivider() }
                    row(entry)
                }
            }
        }
    }

    private var chart: some View {
        Chart(entries) { entry in
            LineMark(x: .value("Data", entry.createdAt), y: .value("Preț", entry.newPrice))
                .interpolationMethod(.monotone)
                .foregroundStyle(AppTheme.Colors.primaryText)
            PointMark(x: .value("Data", entry.createdAt), y: .value("Preț", entry.newPrice))
                .foregroundStyle(AppTheme.Colors.primaryText)
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { value in
                AxisGridLine()
                AxisValueLabel {
                    if let date = value.as(Date.self) {
                        Text(date.dayMonth)
                    }
                }
            }
        }
        .chartYAxisLabel("RON")
        .frame(height: 160)
        .accessibilityLabel("Grafic istoric preț")
    }

    private func row(_ entry: PriceHistoryEntry) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.oldPrice.map { "\($0.ronFormatted) → \(entry.newPrice.ronFormatted)" }
                    ?? entry.newPrice.ronFormatted)
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                Text("\(entry.changedBy.firstName) \(entry.changedBy.lastName)")
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            Spacer(minLength: 8)
            Text(StockDate.short(entry.createdAt))
                .font(AppFont.body(12))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Intake lots

/// One intake lot: date + supplier, quantity pill, meta, FIFO remaining bar
/// and the hold/release action.
struct StockLotCard: View {
    let lot: StockLotEntry
    let unit: UnitType?
    let canManage: Bool
    let onToggleHold: () -> Void

    private var remaining: Double { lot.remainingQuantity ?? lot.quantity }
    private var fraction: Double {
        lot.quantity > 0 ? max(0, min(1, remaining / lot.quantity)) : 0
    }

    private func qty(_ value: Double) -> String {
        unit.map { $0.stockDisplay(value) } ?? value.qtyFormatted
    }

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 10) {
                header
                VStack(spacing: 4) {
                    if let price = lot.purchasePrice {
                        meta("tag", "Preț", price.stockPrice(per: unit?.priceUnitLabel))
                    }
                    if let lotNo = lot.lotNumber, !lotNo.isEmpty {
                        meta("number", "Nr. lot", lotNo)
                    }
                    if let invoice = lot.supplierInvoice, !invoice.isEmpty {
                        meta("doc.text", "Factură", invoice)
                    }
                    if let expiry = lot.expiryDate {
                        meta("calendar", "Expiră", StockDate.short(expiry),
                             tone: expiry < Date() ? .danger : nil)
                    }
                }
                if lot.remainingQuantity != nil { remainingBar }
                if canManage, remaining > 0 { holdRow }
            }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(StockDate.full(lot.receivedAt))
                    .font(AppFont.body(15, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.label)
                if let supplier = lot.supplier, !supplier.isEmpty {
                    Text(supplier)
                        .font(AppFont.body(12))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
            Spacer(minLength: 8)
            Text(qty(lot.quantity))
                .font(AppFont.body(13, weight: .bold))
                .foregroundStyle(AppTheme.Colors.primaryText)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(AppTheme.Colors.primary.opacity(0.12), in: Capsule())
        }
    }

    private var remainingBar: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Rămas")
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                Spacer()
                Text(qty(remaining))
                    .font(AppFont.body(12, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
            }
            HProgressBar(value: fraction, tint: AppTheme.Colors.primary, height: 6)
        }
        .accessibilityElement(children: .combine)
    }

    private var holdRow: some View {
        HStack(spacing: 8) {
            if lot.onHold == true {
                HStatusChip("Păstrat (sărit la FIFO)", kind: .warning)
            }
            Spacer(minLength: 0)
            Button(action: onToggleHold) {
                Text(lot.onHold == true ? "Deblochează" : "Păstrează lotul")
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 36)
                    .overlay(Capsule().strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                    .contentShape(.interaction, Rectangle().inset(by: -4))
            }
            .buttonStyle(.plain)
            .help(lot.onHold == true
                  ? "Lotul revine în ordinea FIFO"
                  : "Producția consumă întâi celelalte loturi")
        }
    }

    private func meta(
        _ icon: String, _ label: String, _ value: String, tone: AppTheme.Status.Kind? = nil
    ) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .frame(width: 16)
                .accessibilityHidden(true)
            Text(label)
                .font(AppFont.body(12))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            Spacer(minLength: 8)
            Text(value)
                .font(AppFont.body(12, weight: .semibold))
                .foregroundStyle(tone.map { AppTheme.Status.fg($0) } ?? AppTheme.Colors.label)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Footer

/// "Creat 17 octombrie 2026, 12:52 · Actualizat …" in muted small text.
struct StockTimestampsFooter: View {
    let createdAt: Date
    let updatedAt: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Creat \(StockDate.fullTime(createdAt))")
            Text("Actualizat \(StockDate.fullTime(updatedAt))")
        }
        .font(AppFont.body(12))
        .foregroundStyle(AppTheme.Colors.secondaryLabel)
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview("Stock detail cards") {
    ScrollView {
        VStack(spacing: 12) {
            StockDetailHeader(
                eyebrow: "Materie primă", title: "Făină albă 000", status: .ACTIVE,
                category: "Făinuri", meta: "Băneasa · prag minim 10 kg", onCategoryTap: {})
            StockLevelsCard(levels: [
                StockLevel(label: "În stoc", value: "12 kg"),
                StockLevel(label: "Rezervat", value: "2 kg", tone: .warning),
            ])
            StockTimestampsFooter(createdAt: Date(), updatedAt: Date())
        }
        .padding(16)
    }
    .background(AppTheme.Colors.appBackground)
}
