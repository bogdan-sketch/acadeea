import SwiftUI

// MARK: - Kind palette

/// The three stock super-categories in the FIXED status palette (same hex on
/// every scheme and on web): materii prime = green, semipreparate = blue,
/// produse finite = accent rose.
enum StockKindPalette {
    static func tone(_ kind: String?) -> AppTheme.Status.Kind {
        switch kind {
        case "MATERIE_PRIMA": .ready
        case "SEMIPREPARAT": .inProgress
        default: .new
        }
    }
}

// MARK: - Kind tiles

/// Three tiles (count in Fraunces over the name + PRIM/SEMI/FINIT); the
/// selected one is filled solid. Tap the active tile again to show all kinds.
struct StockKindTiles: View {
    /// (kind key, count) in display order.
    let kinds: [(key: String, count: Int)]
    @Binding var selection: String?

    var body: some View {
        HStack(spacing: 8) {
            ForEach(kinds, id: \.key) { kind in
                tile(kind.key, count: kind.count)
            }
        }
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func tile(_ key: String, count: Int) -> some View {
        let isOn = selection == key
        let tone = StockKindPalette.tone(key)
        return Button {
            withAnimation(.snappy(duration: 0.2)) { selection = isOn ? nil : key }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(count)")
                    .font(AppFont.display(24))
                    .monospacedDigit()
                VStack(alignment: .leading, spacing: 2) {
                    Text(CategoryKindStyle.name(forKind: key))
                        .font(AppFont.body(12, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text(CategoryKindStyle.label(forKind: key).uppercased())
                        .font(AppFont.body(9, weight: .bold))
                        .tracking(0.5)
                        .opacity(0.75)
                }
            }
            .foregroundStyle(isOn ? Color.white : AppTheme.Status.fg(tone))
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                isOn ? AppTheme.Status.fg(tone) : AppTheme.Status.bg(tone),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(CategoryKindStyle.name(forKind: key)), \(count)")
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        .help("Arată doar \(CategoryKindStyle.name(forKind: key).lowercased())")
    }
}

// MARK: - Group card

/// One category group of the stock list: a card whose header (category pill
/// tinted in the kind colour + "PRIM · 3" + chevron) folds the rows.
struct StockGroupCard<Rows: View>: View {
    let title: String
    let kind: String?
    let count: Int
    let isCollapsed: Bool
    let onToggle: () -> Void
    @ViewBuilder let rows: () -> Rows

    var body: some View {
        VStack(spacing: 0) {
            Button(action: onToggle) {
                HStack(spacing: 8) {
                    Text(title)
                        .font(AppFont.body(12, weight: .bold))
                        .lineLimit(1)
                        .padding(.horizontal, 9)
                        .frame(minHeight: 24)
                        .background(AppTheme.Status.bg(tone), in: Capsule())
                        .foregroundStyle(AppTheme.Status.fg(tone))
                    Text("\(CategoryKindStyle.label(forKind: kind)) · \(count)".uppercased())
                        .font(AppFont.body(11, weight: .bold))
                        .tracking(0.4)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .rotationEffect(.degrees(isCollapsed ? 0 : 180))
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, 14)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(title), \(count)")
            .accessibilityHint(isCollapsed ? "Deschide grupul" : "Închide grupul")
            .accessibilityAddTraits(.isHeader)

            if !isCollapsed {
                rows()
            }
        }
        .background(AppTheme.Colors.card, in: shape)
        .clipShape(shape)
        .overlay(shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
    }

    private var tone: AppTheme.Status.Kind { StockKindPalette.tone(kind) }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
    }
}

// MARK: - Row

/// One product line: status dot, name + sub-line (minimum, lots, expiry),
/// quantity coloured by status, chevron. Top hairline separates rows.
struct StockItemRow: View {
    let title: String
    let subtitle: String?
    var subtitleTone: AppTheme.Status.Kind?
    let quantity: String
    let status: AppTheme.Status.Kind

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(AppTheme.Status.fg(status))
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AppFont.body(15, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(2)
                if let subtitle {
                    Text(subtitle)
                        .font(AppFont.body(12))
                        .foregroundStyle(subtitleTone.map(AppTheme.Status.fg) ?? AppTheme.Colors.secondaryLabel)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text(quantity)
                .font(AppFont.body(14, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(status == .ready ? AppTheme.Colors.label : AppTheme.Status.fg(status))
                .lineLimit(1)
                .fixedSize()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.secondaryLabel.opacity(0.7))
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(minHeight: 48)
        .overlay(alignment: .top) {
            Rectangle().fill(AppTheme.Colors.border).frame(height: 1)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(statusLabel)
    }

    private var statusLabel: String {
        switch status {
        case .danger: "Fără stoc"
        case .warning: "Sub stocul minim"
        default: ""
        }
    }
}

#Preview("Stock components") {
    @Previewable @State var kind: String? = "MATERIE_PRIMA"
    ScrollView {
        VStack(spacing: 10) {
            StockKindTiles(
                kinds: [("MATERIE_PRIMA", 6), ("SEMIPREPARAT", 3), ("PRODUS_FINIT", 4)],
                selection: $kind)
            StockGroupCard(title: "Lactate", kind: "MATERIE_PRIMA", count: 3, isCollapsed: false, onToggle: {}) {
                StockItemRow(title: "Unt 82%", subtitle: "min 5 kg", quantity: "3,2 kg", status: .warning)
                StockItemRow(title: "Smântână 35%", subtitle: nil, quantity: "0 l", status: .danger)
                StockItemRow(title: "Mascarpone", subtitle: "exp 18 oct.", quantity: "2,4 kg", status: .ready)
            }
        }
        .padding(16)
    }
    .background(AppTheme.Colors.appBackground)
}

// MARK: - Quantity display

extension UnitType {
    /// Alias of `humanizedString` (which renders zero in the item unit, "0 kg"),
    /// kept for the stock call sites.
    func stockDisplay(_ value: Double) -> String {
        humanizedString(value)
    }
}
