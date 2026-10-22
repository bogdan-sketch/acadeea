import SwiftUI

/// iPad, sidebar ascuns: dock-ul plutitor, centrat jos, care preia ce era in
/// sidebar — cele cinci sectiuni (aceeasi ordine ca tab bar-ul de pe iPhone)
/// + butonul de re-afisare a sidebar-ului. Crearea ramane pe "+"-ul fiecarui
/// ecran (FAB), ca sa nu apara doua butoane "+" unul langa altul.
struct AppDockView: View {
    @Binding var selectedTab: AppTab
    /// Re-afiseaza sidebar-ul.
    let showSidebar: () -> Void
    /// Sectiunea (apasata din nou = inapoi la radacina).
    let selectSection: (AppTab) -> Void

    private var sections: [AppTabItem] { AppTabItem.visible }

    var body: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            Button(action: showSidebar) {
                Image(systemName: "sidebar.left")
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .accessibilityLabel("Arată bara laterală")
            .help("Arată bara laterală")
            .accessibilityIdentifier("dock.showSidebar")

            Divider().frame(height: 28)

            ForEach(sections, id: \.tab) { section in
                let isOn = section.tab == selectedTab
                Button { selectSection(section.tab) } label: {
                    VStack(spacing: 2) {
                        Image(systemName: section.icon)
                            .font(.title3)
                            .environment(\.symbolVariants, isOn ? .fill : .none)
                        Text(section.title)
                            .font(AppFont.body(11, weight: isOn ? .bold : .medium))
                            .lineLimit(1)
                    }
                    .frame(minWidth: 64, minHeight: 52)
                    .foregroundStyle(isOn ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryLabel)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(isOn ? AppTheme.Colors.primary.opacity(0.12) : Color.clear)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(section.title)
                .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.sm)
        .padding(.vertical, AppTheme.Spacing.xs)
        // Scheme tab-bar token + border, like the iPhone bar (not a system
        // material whose grey labels fail contrast).
        .background(AppTheme.Colors.tabBar, in: Capsule())
        .overlay(Capsule().strokeBorder(AppTheme.Colors.border))
        .shadow(color: .black.opacity(0.12), radius: 14, y: 6)
        .padding(.top, AppTheme.Spacing.sm)
        .padding(.bottom, AppTheme.Spacing.md)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("dock")
    }
}
