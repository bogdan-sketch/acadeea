import SwiftUI
import Observation

/// One entry of the iPad sidebar: either a main section (same five as the
/// iPhone tabs) or a secondary screen pushed on a host section's stack.
enum SidebarItem: Hashable {
    case tab(AppTab)
    case route(Route, host: AppTab)

    /// The section whose NavigationStack hosts this item.
    var host: AppTab {
        switch self {
        case .tab(let tab): return tab
        case .route(_, let host): return host
        }
    }
}

/// Sidebar rail for the regular-width (iPad) layout — replaces the tab bar.
/// Prototype IPadPanou / IPadStoc / IPadComanda: org header, grouped rows
/// (ZILNIC · CATALOG · STOC · ECHIPĂ) with an icon and label (no count badges), and
/// the signed-in user at the bottom opening Setări. Everything else (tools,
/// admin) stays reachable from the Stoc quick actions and Setări.
struct AppSidebarView: View {
    @Binding var selection: SidebarItem?
    /// False on Panou: the dashboard's own header carries the org name/date,
    /// so the rail keeps the slot empty (no jump) instead of repeating it.
    var showsOrgHeader = true
    @State private var showLogoutConfirm = false

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    private var canSeeStock: Bool {
        permissions.can(.read, .RawMaterial) && permissions.can(.read, .Consumable)
    }

    private struct Entry: Identifiable {
        let title: String
        let icon: String
        let item: SidebarItem
        var id: SidebarItem { item }
    }

    private var groups: [(title: String, entries: [Entry])] {
        // Same entries, order and icons as the web rail.
        var daily = [Entry(title: "Panou principal", icon: "house", item: .tab(.dashboard))]
        if permissions.can(.read, .Task) {
            daily.append(Entry(title: "Producție", icon: "list.clipboard", item: .tab(.tasks)))
        }
        if permissions.can(.read, .Order) {
            daily.append(Entry(title: "Comenzi", icon: "bag", item: .tab(.orders)))
        }
        if permissions.can(.read, .Task) {
            daily.append(Entry(title: "Calendar", icon: "calendar", item: .route(.productionCalendar, host: .tasks)))
        }

        var catalog: [Entry] = []
        if permissions.can(.read, .Recipe) {
            catalog.append(Entry(title: "Rețete", icon: "book", item: .tab(.recipes)))
        }
        if permissions.isAdmin || permissions.can(.update, .Recipe) {
            catalog.append(Entry(title: "Prețuri", icon: "tag", item: .route(.priceHistory, host: .recipes)))
        }

        var stock: [Entry] = []
        if canSeeStock {
            stock = [
                Entry(title: "Stoc", icon: "cube", item: .tab(.stock)),
                Entry(title: "Mișcări", icon: "arrow.left.arrow.right", item: .route(.stockMovements, host: .stock)),
            ]
            if permissions.isAdmin {
                stock.append(Entry(title: "Revizie stocuri", icon: "checklist", item: .route(.stockReview, host: .stock)))
            }
            if SalesDeductionFeature.shared.isAvailable(permissions) {
                stock.append(Entry(title: "Vânzări → stoc", icon: "receipt", item: .route(.salesDeductions, host: .stock)))
            }
        }

        var team: [Entry] = []
        if permissions.isAdmin
            || (permissions.can(.read, .Recipe) && permissions.can(.update, .Recipe)) {
            team.append(Entry(title: "Statistici", icon: "chart.bar", item: .route(.analyticsDashboard, host: .dashboard)))
        }
        if permissions.isAdmin {
            team.append(Entry(title: "Echipă & roluri", icon: "person.2", item: .route(.userList, host: .dashboard)))
        }

        return [("Zilnic", daily), ("Catalog", catalog), ("Stoc", stock), ("Echipă", team)]
            .filter { !$0.1.isEmpty }
            .map { (title: $0.0, entries: $0.1) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SidebarOrgHeader()
                .padding(.horizontal, 8)
                .padding(.bottom, 14)
                .opacity(showsOrgHeader ? 1 : 0)
                .accessibilityHidden(!showsOrgHeader)

            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(groups, id: \.title) { group in
                        Text(group.title.uppercased())
                            .font(AppFont.body(11, weight: .bold))
                            .tracking(0.6)
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            .padding(.horizontal, 8)
                            .padding(.top, 12)
                            .padding(.bottom, 4)
                            .accessibilityAddTraits(.isHeader)
                        ForEach(group.entries) { entry in
                            SidebarRow(
                                title: entry.title,
                                icon: entry.icon,
                                isSelected: selection == entry.item
                            ) {
                                selection = entry.item
                            }
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)

            SidebarUserFooter(isSelected: selection == .route(.settings, host: .dashboard)) {
                selection = .route(.settings, host: .dashboard)
            }
            Button {
                showLogoutConfirm = true
            } label: {
                Label("Deconectare", systemImage: "rectangle.portrait.and.arrow.right")
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .padding(.horizontal, 10)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Deconectare")
        }
        .padding(.top, 28)
        .padding(.horizontal, 12)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(sidebarSurface.ignoresSafeArea())
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(AppTheme.Colors.border)
                .frame(width: 1)
                .ignoresSafeArea()
        }
        .toolbar(.hidden, for: .navigationBar)
        .alert("Sigur vrei să te deconectezi?", isPresented: $showLogoutConfirm) {
            Button("Deconectare", role: .destructive) {
                WebSocketManager.shared.disconnect()
                AuthManager.shared.logout()
            }
            Button("Anulează", role: .cancel) {}
        } message: {
            Text("Va trebui să te autentifici din nou.")
        }
    }

    /// Paper surface: the page background lifted a step towards the card
    /// colour (#FBF9F6 on Atelier), so it works for light and dark schemes.
    private var sidebarSurface: some View {
        ZStack {
            AppTheme.Colors.appBackground
            AppTheme.Colors.card.opacity(0.5)
        }
    }
}

// MARK: - Pieces

private struct SidebarRow: View {
    let title: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .medium))
                    .symbolVariant(isSelected ? .fill : .none)
                    .foregroundStyle(isSelected ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryLabel)
                    .frame(width: 22)
                    .accessibilityHidden(true)
                Text(title)
                    .font(AppFont.body(14, weight: isSelected ? .bold : .medium))
                    .foregroundStyle(isSelected ? AppTheme.Colors.primaryText : AppTheme.Colors.label)
                    .lineLimit(1)
                Spacer(minLength: 4)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(minHeight: 44)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isSelected ? AppTheme.Colors.primary.opacity(0.10) : .clear)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct SidebarOrgHeader: View {
    private var orgName: String { BrandingManager.shared.organizationName }

    var body: some View {
        HStack(spacing: 10) {
            Text(String(orgName.prefix(1)).uppercased())
                .font(AppFont.body(14, weight: .bold))
                .foregroundStyle(AppTheme.Colors.onPrimary)
                .frame(width: 32, height: 32)
                .background(AppTheme.Colors.primary, in: Circle())
                .accessibilityHidden(true)
            TimelineView(.everyMinute) { context in
                VStack(alignment: .leading, spacing: 1) {
                    Text(orgName)
                        .font(AppFont.body(14, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.label)
                    Text(RoDate.longDay(context.date))
                        .font(AppFont.body(11))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
                .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct SidebarUserFooter: View {
    let isSelected: Bool
    let openSettings: () -> Void

    var body: some View {
        if let user = AuthManager.shared.currentUser {
            Button(action: openSettings) {
                HStack(spacing: 10) {
                    UserAvatarView(
                        avatarUrl: user.avatarUrl,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        size: 32
                    )
                    VStack(alignment: .leading, spacing: 1) {
                        Text(user.fullName)
                            .font(AppFont.body(13, weight: .bold))
                            .foregroundStyle(AppTheme.Colors.label)
                        Text("Profil & setări")
                            .font(AppFont.body(11))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    }
                    .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .padding(8)
                .frame(minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(isSelected ? AppTheme.Colors.primary.opacity(0.10) : .clear)
                )
                .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Profil & setări, \(user.fullName)")
            .accessibilityAddTraits(isSelected ? .isSelected : [])
            .help("Profil & setări")
        }
    }
}

#Preview("AppSidebarView") {
    @Previewable @State var selection: SidebarItem? = .tab(.stock)
    AppSidebarView(selection: $selection)
        .frame(width: 232)
}
