import SwiftUI

// MARK: - Header

/// User bubble (photo/initials, name, role → Profil & setări) on the left,
/// search and notifications on the right.
struct DashboardHeader: View {
    let unreadNotifications: Int
    let showsSearch: Bool
    let openNotifications: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            // iPad: hide/show-sidebar button, top-left of the content.
            SidebarToggleButton()
            DashboardUserBubble()
                .frame(maxWidth: .infinity, alignment: .leading)

            if showsSearch {
                NavigationLink(value: Route.stockSearch) {
                    IconChrome(systemImage: "magnifyingglass")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Caută în stoc")
                .help("Caută în stoc")
            }

            Button(action: openNotifications) {
                IconChrome(systemImage: "bell")
                    .overlay(alignment: .topTrailing) {
                        if unreadNotifications > 0 {
                            Circle()
                                .fill(AppTheme.Status.fg(.new))
                                .frame(width: 8, height: 8)
                                .offset(x: -9, y: 9)
                        }
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(unreadNotifications > 0
                ? "Notificări: \(unreadNotifications) necitite" : "Notificări")
            .help("Notificări")
        }
    }
}

/// Capsule with the signed-in user's photo (initials fallback), name and role.
private struct DashboardUserBubble: View {
    var body: some View {
        if let user = AuthManager.shared.currentUser {
            NavigationLink(value: Route.settings) {
                HStack(spacing: 8) {
                    UserAvatarView(
                        avatarUrl: user.avatarUrl,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        size: 32
                    )
                    .overlay(Circle().strokeBorder(.white.opacity(0.9), lineWidth: 1.5))
                    VStack(alignment: .leading, spacing: 0) {
                        Text(user.fullName)
                            .font(AppFont.body(13, weight: .bold))
                            .foregroundStyle(AppTheme.Colors.label)
                        Text(user.role.name)
                            .font(AppFont.body(11))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    }
                    .lineLimit(1)
                    .padding(.trailing, 6)
                }
                .padding(4)
                .frame(minHeight: 44)
                .background(AppTheme.Colors.card, in: Capsule())
                .overlay(Capsule().strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Profil & setări, \(user.fullName), \(user.role.name)")
            .help("Profil & setări")
        }
    }
}

// MARK: - Org wordmark

/// The organization's logo as a hero wordmark (dark logo on dark schemes,
/// light one otherwise); without a logo, the org name in Fraunces.
struct DashboardOrgWordmark: View {
    private var branding: BrandingManager { .shared }
    private var isDark: Bool { AppSchemeStore.shared.scheme.isDark }

    private var logo: Image? {
        let light = [branding.logoLightUrl, branding.appLogoLightUrl]
        let dark = [branding.logoDarkUrl, branding.appLogoDarkUrl]
        let candidates = isDark ? dark + light : light
        return candidates.lazy.compactMap { BrandingManager.image(fromDataUri: $0) }.first
    }

    var body: some View {
        Group {
            if let logo {
                logo
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 280, maxHeight: 44, alignment: .leading)
                    .accessibilityLabel(branding.organizationName)
            } else {
                Text(branding.organizationName)
                    .font(AppFont.title(32))
                    .tracking(-0.4)
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - KPI grid

struct DashboardKpiGrid: View {
    let viewModel: DashboardViewModel
    let isWide: Bool
    let canSeeStock: Bool

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 10), count: isWide ? 4 : 2)
    }

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            kpi(.taskList, "Taskuri azi", "\(viewModel.todayTasksDue)", tasksHint, .inProgress)
            kpi(.orderList, "Comenzi azi", "\(viewModel.todayOrdersDue)", ordersHint, .new)
            if canSeeStock {
                Button {
                    StockDeepLink.shared.open(status: nil, locationId: viewModel.selectedLocationId)
                } label: {
                    card("Alerte stoc", "\(alerts)", stockHint, .warning)
                }
                .buttonStyle(.plain)
                kpi(.expiryTracking, "Expiră în 3 zile", "\(viewModel.expiringSoon.count)", expiryHint, .ready)
            } else {
                card("Vânzări azi", salesValue, nil, .ready)
            }
        }
    }

    private func kpi(
        _ route: Route, _ label: String, _ value: String, _ hint: String?, _ kind: AppTheme.Status.Kind
    ) -> some View {
        NavigationLink(value: route) { card(label, value, hint, kind) }
            .buttonStyle(.plain)
    }

    private func card(_ label: String, _ value: String, _ hint: String?, _ kind: AppTheme.Status.Kind) -> some View {
        // A blank hint keeps the four cards the same height.
        HStatCard(label, value: value, hint: hint ?? " ", dot: AppTheme.Status.fg(kind))
    }

    private var alerts: Int { viewModel.outOfStockCount + viewModel.lowStockCount }

    private var tasksHint: String {
        let blocked = viewModel.taskCount(for: .BLOCAT)
        let base = "\(viewModel.tasksInProgress) în lucru"
        return blocked > 0 ? "\(base) · \(blocked) blocate" : base
    }

    private var ordersHint: String {
        let pickups = RoCount.format(viewModel.todayPickups, one: "ridicare", many: "ridicări")
        let deliveries = RoCount.format(viewModel.todayDeliveries, one: "livrare", many: "livrări")
        return "\(pickups) · \(deliveries)"
    }

    private var stockHint: String {
        "\(viewModel.outOfStockCount) epuizat · \(viewModel.lowStockCount) sub minim"
    }

    private var expiryHint: String {
        guard !viewModel.expiringSoon.isEmpty else { return "Nimic nu expiră" }
        return viewModel.expiringSoon.prefix(2).map(\.materialTitle).joined(separator: " · ")
    }

    private var salesValue: String {
        let amount = viewModel.todaySalesAmount
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = "."
        formatter.decimalSeparator = ","
        formatter.maximumFractionDigits = amount.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 2
        return "\(formatter.string(from: NSNumber(value: amount)) ?? "0") RON"
    }
}

// MARK: - Production

struct DashboardProductionCard: View {
    let tasks: [DashboardRecentTask]
    let inProgress: Int

    var body: some View {
        HListCard {
            CardHeader(title: "Producție acum", trailing: "Toate", route: .taskList)
            if tasks.isEmpty {
                CardDivider()
                emptyRow("Niciun task activ")
            }
            ForEach(tasks) { task in
                CardDivider()
                NavigationLink(value: Route.taskDetail(id: task.id)) {
                    DashboardTaskRow(task: task)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct DashboardTaskRow: View {
    let task: DashboardRecentTask

    private var status: TaskStatus? { TaskStatus(rawValue: task.status) }

    var body: some View {
        HStack(spacing: 12) {
            Text(QtyBadge.text(task.targetQuantity, unitRaw: task.targetUnit))
                .font(AppFont.display(14))
                .foregroundStyle(AppTheme.Colors.label)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 4)
                .frame(minWidth: 40, minHeight: 40)
                .background(AppTheme.Colors.appBackground,
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(task.displayName ?? task.recipeName)
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(1)
                Text(task.assignedToName ?? "Nealocat")
                    .font(AppFont.body(11))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .lineLimit(1)
                if let status {
                    HProgressBar(value: status.hStageFraction, tint: status.hColor, height: 4)
                        .padding(.top, 2)
                }
            }
            if let status { TaskStatusPill(status: status) }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Orders

struct DashboardOrdersCard: View {
    let orders: [OrderResponse]

    var body: some View {
        HListCard {
            CardHeader(title: "Comenzile de azi", trailing: "Toate", route: .orderList)
            if orders.isEmpty {
                CardDivider()
                emptyRow("Nicio comandă pentru azi")
            }
            ForEach(orders) { order in
                CardDivider()
                NavigationLink(value: Route.orderDetail(id: order.id)) {
                    DashboardOrderRow(order: order)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct DashboardOrderRow: View {
    let order: OrderResponse

    var body: some View {
        HStack(spacing: 12) {
            OrderRowLines(order: order, productSize: 14)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStatusChip(order.status.displayName, kind: order.status.kind)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(order.rowAccessibilityText)
    }
}

// MARK: - Stock alerts (amber)

struct DashboardStockAlertsCard: View {
    let materials: [LowStockMaterial]
    let outOfStock: Int
    let lowStock: Int
    let locationId: String?

    private let amber = AppTheme.Status.fg(.warning)
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 16, style: .continuous) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Label("Alerte stoc", systemImage: "exclamationmark.triangle.fill")
                    .font(AppFont.body(15, weight: .bold))
                    .foregroundStyle(amber)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button {
                    StockDeepLink.shared.open(status: nil, locationId: locationId)
                } label: {
                    HStack(spacing: 3) {
                        Text("Stoc")
                        Image(systemName: "arrow.right").imageScale(.small)
                    }
                    .font(AppFont.body(12, weight: .semibold))
                    .foregroundStyle(amber)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Deschide stocul")
            }
            .padding(.horizontal, 14)
            Text("\(outOfStock) epuizat · \(lowStock) sub minim")
                .font(AppFont.body(12, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .padding(.horizontal, 14)
                .padding(.bottom, 8)
            ForEach(materials) { material in
                Rectangle().fill(amber.opacity(0.2)).frame(height: 1)
                NavigationLink(value: Route.rawMaterialDetail(id: material.id)) {
                    row(material)
                }
                .buttonStyle(.plain)
            }
        }
        .background {
            ZStack {
                AppTheme.Colors.card
                amber.opacity(0.08)
            }
            .clipShape(shape)
        }
        .overlay(shape.strokeBorder(amber.opacity(0.45), lineWidth: 1))
        .clipShape(shape)
    }

    private func row(_ material: LowStockMaterial) -> some View {
        let isOut = material.status == "OUT_OF_STOCK"
        let tint = AppTheme.Status.fg(isOut ? .danger : .warning)
        return HStack(spacing: 10) {
            Circle().fill(tint).frame(width: 8, height: 8)
            Text(material.name)
                .font(AppFont.body(13, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.label)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(amount(material))
                .font(AppFont.body(12, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(tint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func amount(_ material: LowStockMaterial) -> String {
        guard let raw = material.unit else {
            return "\(material.currentStock.qtyFormatted) / min \(material.minimumStock.qtyFormatted)"
        }
        return "\(UnitType.formatQty(material.currentStock, unitRaw: raw)) / min \(UnitType.formatQty(material.minimumStock, unitRaw: raw))"
    }
}

// MARK: - Helpers

private func emptyRow(_ text: String) -> some View {
    Text(text)
        .font(AppFont.body(13))
        .foregroundStyle(AppTheme.Colors.secondaryLabel)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
}

#Preview("Dashboard sections") {
    NavigationStack {
        ScrollView {
            VStack(spacing: 12) {
                DashboardOrgWordmark()
                DashboardProductionCard(tasks: [], inProgress: 0)
                DashboardOrdersCard(orders: [])
                DashboardStockAlertsCard(materials: [], outOfStock: 1, lowStock: 3, locationId: nil)
            }
            .padding()
        }
        .background(AppTheme.Colors.appBackground)
    }
}
