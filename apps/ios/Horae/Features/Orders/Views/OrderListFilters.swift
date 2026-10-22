import SwiftUI

// MARK: - Search field

/// In-content search field of the redesign (card surface, 1px border, radius 12).
struct OrderSearchField: View {
    @Binding var text: String
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .accessibilityHidden(true)
            TextField("Nr. comandă, client, produs", text: $text)
                .font(AppFont.body(14))
                .foregroundStyle(AppTheme.Colors.label)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused($focused)
                .accessibilityLabel("Caută comandă")
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Șterge căutarea")
                .help("Șterge căutarea")
            }
        }
        .padding(.leading, 12)
        .padding(.trailing, text.isEmpty ? 12 : 0)
        .frame(minHeight: 44)
        .background(AppTheme.Colors.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(AppTheme.Colors.border, lineWidth: 1))
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
    }
}

// MARK: - Status filter (1.39.0)

/// Filter icon of the Comenzi head (list + calendar): a small menu with a
/// multi-select of statuses + "Toate". Default only "Nouă"; a dot on the icon
/// shows when the selection differs from it. The menu stays open while
/// picking so several statuses can be ticked in one go.
struct OrderStatusFilterButton: View {
    let area: OrdersAreaState
    var counts: [String: Int]? = nil
    /// Navigation-bar variant: bare glyph, the bar draws the chrome.
    var inToolbar = false

    @ScaledMetric(relativeTo: .body) private var baseSide: CGFloat = 40

    var body: some View {
        Menu {
            Button {
                area.statusFilter = []
            } label: {
                if area.statusFilter.isEmpty {
                    Label("Toate", systemImage: "checkmark")
                } else {
                    Text("Toate")
                }
            }
            Divider()
            ForEach(OrderStatus.allCases) { status in
                Button {
                    area.toggleStatus(status)
                } label: {
                    let title = counts?[status.rawValue].map { "\(status.displayName) · \($0)" } ?? status.displayName
                    if area.statusFilter.contains(status) {
                        Label(title, systemImage: "checkmark")
                    } else {
                        Text(title)
                    }
                }
            }
            if !area.isStatusFilterDefault {
                Divider()
                Button {
                    area.statusFilter = OrdersAreaState.defaultStatuses
                } label: {
                    Label("Doar comenzile noi", systemImage: "arrow.uturn.backward")
                }
            }
        } label: {
            if inToolbar {
                Image(systemName: "line.3.horizontal.decrease")
                    .overlay(alignment: .topTrailing) { badge.offset(x: 4, y: -4) }
            } else {
                let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
                let side = min(56, baseSide)
                Image(systemName: "line.3.horizontal.decrease")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .frame(width: side, height: side)
                    .background(AppTheme.Colors.appBackground, in: shape)
                    .overlay(shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                    .overlay(alignment: .topTrailing) { badge.offset(x: 2, y: -2) }
                    .contentShape(.interaction, Rectangle().inset(by: -2))
            }
        }
        .menuActionDismissBehavior(.disabled)
        .buttonStyle(.plain)
        .accessibilityLabel("Filtrează după status")
        .accessibilityValue(area.statusSummary)
        .help("Filtrează după status · \(area.statusSummary)")
        .sensoryFeedback(.selection, trigger: area.statusFilter)
    }

    /// Dot when the selection differs from the default (only "Nouă").
    @ViewBuilder
    private var badge: some View {
        if !area.isStatusFilterDefault {
            Circle()
                .fill(AppTheme.Colors.primary)
                .frame(width: 9, height: 9)
                .overlay(Circle().strokeBorder(AppTheme.Colors.appBackground, lineWidth: 1.5))
                .accessibilityHidden(true)
        }
    }
}

#Preview("Filters") {
    VStack(spacing: 12) {
        OrderSearchField(text: .constant(""))
            .padding(.horizontal)
        OrderStatusFilterButton(area: OrdersAreaState.shared)
    }
    .padding(.vertical)
    .background(AppTheme.Colors.appBackground)
}
