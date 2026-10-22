import SwiftUI

/// Legacy status badge (pre-redesign screens). Renders the Romanian label and
/// the fixed status palette of the enum's single mapping (`kind`), so it reads
/// the same as `HStatusChip` — "Activ", never "ACTIVE".
struct StatusBadge: View {
    let text: String
    let color: Color
    private var wash: Color?

    var body: some View {
        Text(text)
            .font(AppFont.body(12, weight: .bold))
            .lineLimit(1)
            .padding(.horizontal, AppTheme.Spacing.sm)
            .padding(.vertical, AppTheme.Spacing.xxs)
            .foregroundStyle(color)
            .background(wash ?? color.opacity(0.12), in: Capsule())
    }

    // MARK: - Convenience initializers

    init(taskStatus: TaskStatus) {
        self.init(text: taskStatus.displayName, kind: taskStatus.kind)
    }

    init(materialStatus: MaterialStatus) {
        self.init(text: materialStatus.displayName, kind: materialStatus.kind)
    }

    init(orderStatus: OrderStatus) {
        self.init(text: orderStatus.displayName, kind: orderStatus.kind)
    }

    init(transferStatus: TransferStatus) {
        self.init(text: transferStatus.displayName, kind: transferStatus.kind)
    }

    /// Fixed palette; nil kind = neutral (muted ink on the scheme's border tint).
    init(text: String, kind: AppTheme.Status.Kind?) {
        self.text = text
        self.color = AppTheme.Status.color(kind)
        self.wash = kind.map(AppTheme.Status.bg) ?? AppTheme.Colors.border
    }

    init(text: String, color: Color) {
        self.text = text
        self.color = color
        self.wash = nil
    }
}

#Preview {
    VStack(spacing: 8) {
        StatusBadge(taskStatus: .DE_FACUT)
        StatusBadge(taskStatus: .IN_LUCRU)
        StatusBadge(materialStatus: .ACTIVE)
        StatusBadge(orderStatus: .LIVRATA)
        StatusBadge(transferStatus: .IN_ASTEPTARE)
    }
    .padding()
    .background(AppTheme.Colors.card)
}
