import SwiftUI

/// Status pill in the FIXED status palette (`AppTheme.Status`, never themed by
/// the accent): tinted wash + dot + label. Light schemes get the pastel wash,
/// dark ones the fg at 20 % (no light islands on dark cards).
struct HStatusChip: View {
    private let title: String
    private let kind: AppTheme.Status.Kind

    init(_ title: String, kind: AppTheme.Status.Kind) {
        self.title = title
        self.kind = kind
    }

    /// The order status in its single label/colour mapping (Enums.swift).
    init(orderStatus: OrderStatus) {
        self.init(orderStatus.displayName, kind: orderStatus.kind)
    }

    /// The transfer status in its single label/colour mapping (Enums.swift).
    init(transferStatus: TransferStatus) {
        self.init(transferStatus.displayName, kind: transferStatus.kind)
    }

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(AppTheme.Status.fg(kind))
                .frame(width: 6, height: 6)
                .accessibilityHidden(true)
            Text(title)
                .font(AppFont.body(11, weight: .bold))
                .lineLimit(1)
        }
        .foregroundStyle(AppTheme.Status.fg(kind))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(AppTheme.Status.bg(kind), in: Capsule())
    }
}

#Preview("HStatusChip") {
    VStack(alignment: .leading, spacing: 8) {
        HStatusChip("Nouă", kind: .new)
        HStatusChip("În lucru", kind: .inProgress)
        HStatusChip("Gata", kind: .ready)
        HStatusChip("Stoc scăzut", kind: .warning)
        HStatusChip("Anulată", kind: .danger)
        HStatusChip(orderStatus: .LIVRATA)
        HStatusChip(transferStatus: .IN_TRANZIT)
    }
    .padding()
    .background(AppTheme.Colors.card)
}
