import SwiftUI

/// Profil & setări — ONE screen, two tabs like the web `/profil`:
/// **Date** (the person: name, photo, preferences, security, delete account)
/// and **Setări** (the organisation, only for whoever can update it).
/// Route `.settings` opens it; the sidebar footer and the Panou avatar too.
struct ProfileView: View {
    enum Tab: String, CaseIterable, Identifiable {
        case date = "Date"
        case setari = "Setări"
        var id: String { rawValue }
    }

    @State private var tab: Tab = ProfileView.initialTab
    private var authManager: AuthManager { .shared }

    /// Web: the Setări tab exists for `can('update', 'Organization')`.
    private var canSeeSettings: Bool {
        authManager.permissionManager.can(.update, .Organization)
    }

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ProfileHeader()
                if canSeeSettings {
                    ProfileTabSwitch(selection: $tab)
                }
                if tab == .setari && canSeeSettings {
                    ProfileSettingsTab { id in
                        withAnimation(.snappy) { proxy.scrollTo(id, anchor: .top) }
                    }
                    .transition(.opacity)
                } else {
                    ProfileDateTab()
                        .transition(.opacity)
                }
                ProfileVersionFooter()
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
            .frame(maxWidth: 680)
            // Exactly the scroll view's width: a child that rounds up by a
            // pixel can no longer widen the content and let the page drag
            // sideways. Only the Setări chip strip scrolls horizontally.
            .containerRelativeFrame(.horizontal)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        }
        .background(AppTheme.Colors.appBackground.ignoresSafeArea())
        .navigationTitle("Profil & setări")
        .navigationBarTitleDisplayMode(.inline)
        // Title lives in the content (Fraunces); the bar only carries "back".
        .toolbar { ToolbarItem(placement: .principal) { Text("").accessibilityHidden(true) } }
        .toolbarBackground(.hidden, for: .navigationBar)
        .sensoryFeedback(.selection, trigger: tab)
    }

    private static var initialTab: Tab {
        #if DEBUG
        if ProcessInfo.processInfo.environment["HORAE_DEBUG_ROUTE"] == "settings:setari" {
            return .setari
        }
        #endif
        return .date
    }
}

// MARK: - Header

/// 64pt avatar, "email · rol · firmă", the name in Fraunces.
private struct ProfileHeader: View {
    var body: some View {
        if let user = AuthManager.shared.currentUser {
            HStack(spacing: 14) {
                UserAvatarView(
                    avatarUrl: user.avatarUrl,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    size: 64
                )
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    // Email on its own line, "rol · firmă" under it — never a
                    // separator dangling at the start of a wrapped line.
                    VStack(alignment: .leading, spacing: 1) {
                        Text(user.email)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Text(meta(user))
                    }
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    Text(user.fullName)
                        .font(AppFont.title(28, relativeTo: .largeTitle))
                        .tracking(-0.4)
                        .foregroundStyle(AppTheme.Colors.label)
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .padding(.horizontal, 4)
            .accessibilityElement(children: .combine)
            .tutorialAnchor(id: "auth.basics.account")
        }
    }

    private func meta(_ user: AuthUser) -> String {
        [user.role.name, user.organization?.name]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }
}

// MARK: - Tabs

/// Date | Setări — two-segment control on the scheme paper (44pt), like the
/// web's segmented tablist. Tiles, not a menu.
struct ProfileTabSwitch: View {
    @Binding var selection: ProfileView.Tab
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var pill

    var body: some View {
        HStack(spacing: 2) {
            ForEach(ProfileView.Tab.allCases) { tab in
                let isOn = tab == selection
                Button {
                    if reduceMotion {
                        selection = tab
                    } else {
                        withAnimation(.snappy) { selection = tab }
                    }
                } label: {
                    Text(tab.rawValue)
                        .font(AppFont.body(14, weight: isOn ? .bold : .semibold))
                        .foregroundStyle(isOn ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background {
                            if isOn {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(AppTheme.Colors.card)
                                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                                    .shadow(color: .black.opacity(0.08), radius: 2, y: 1)
                                    .matchedGeometryEffect(id: "pill", in: pill)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
                .accessibilityHint(tab == .date
                    ? "Datele tale, poză, preferințe, securitate"
                    : "Firmă, locații, categorii, echipă, backup")
            }
        }
        .padding(3)
        // Track on the page paper, selected pill on the card colour: reads
        // on light AND dark schemes.
        .background(AppTheme.Colors.appBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .strokeBorder(AppTheme.Colors.border, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Profil & setări")
    }
}

// MARK: - Version

/// "Horae 1.34.2 (build) · test" at the end of the page.
private struct ProfileVersionFooter: View {
    var body: some View {
        Text(label)
            .font(AppFont.body(12))
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .frame(maxWidth: .infinity)
            .padding(.top, 4)
    }

    private var label: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String ?? ""
        let env = AppConfig.baseURL.contains("api-test") ? " · test" : ""
        return "\(AppConfig.brandName) \(version)" + (build.isEmpty ? "" : " (\(build))") + env
    }
}

#Preview("Profil & setări") {
    NavigationStack {
        ProfileView()
    }
    .environment(AppSchemeStore.shared)
}
