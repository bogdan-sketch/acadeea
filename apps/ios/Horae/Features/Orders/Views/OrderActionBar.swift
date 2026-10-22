import SwiftUI

/// Bottom action bar of the order detail: edit icon button + primary
/// "Marchează „<next status>”". Finished orders show their final state.
struct OrderActionBar: View {
    let status: OrderStatus
    let canEdit: Bool
    let canAdvance: Bool
    let isBusy: Bool
    let onEdit: () -> Void
    let onAdvance: (OrderStatus) -> Void

    var body: some View {
        HStack(spacing: 10) {
            if canEdit {
                Button(action: onEdit) {
                    Image(systemName: "pencil")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.label)
                        .frame(width: 50, height: 50)
                        .background(AppTheme.Colors.card, in: shape)
                        .overlay(shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Editează comanda")
                .help("Editează: punct de livrare, adresă, termen, note")
            }
            primary
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .background {
            AppTheme.Colors.tabBar
                .overlay(alignment: .top) { Rectangle().fill(AppTheme.Colors.border).frame(height: 1) }
                .ignoresSafeArea(edges: .bottom)
        }
    }

    @ViewBuilder
    private var primary: some View {
        if canAdvance, let next = status.nextForward {
            let label = "Marchează „\(next.displayName)”"
            Button { onAdvance(next) } label: {
                HStack(spacing: 8) {
                    if isBusy { ProgressView().tint(AppTheme.Colors.onPrimary) }
                    Text(label)
                        .font(AppFont.body(15, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 15, weight: .bold))
                        .accessibilityHidden(true)
                }
                .foregroundStyle(AppTheme.Colors.onPrimary)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(AppTheme.Colors.primary, in: shape)
                .contentShape(shape)
            }
            .buttonStyle(.plain)
            .disabled(isBusy)
            .accessibilityLabel(label)
            .help("Trece comanda în „\(next.displayName)”")
        } else {
            HStack(spacing: 8) {
                OrderStatusBadge(status)
                Text(status.isOpen ? "Fără drept de modificare" : "Comandă încheiată")
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(AppTheme.Colors.card, in: shape)
            .overlay(shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
            .accessibilityElement(children: .combine)
        }
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
    }
}

#Preview("OrderActionBar") {
    VStack(spacing: 0) {
        Spacer()
        OrderActionBar(status: .IN_PREGATIRE, canEdit: true, canAdvance: true, isBusy: false,
                       onEdit: {}, onAdvance: { _ in })
        OrderActionBar(status: .LIVRATA, canEdit: true, canAdvance: true, isBusy: false,
                       onEdit: {}, onAdvance: { _ in })
    }
    .background(AppTheme.Colors.appBackground)
}
