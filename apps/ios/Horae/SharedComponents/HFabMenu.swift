import SwiftUI

/// One choice of an `HFabMenu`.
struct HFabMenuItem: Identifiable {
    let title: String
    let systemImage: String
    let action: () -> Void

    var id: String { title }

    init(_ title: String, systemImage: String, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.action = action
    }
}

/// Floating "+" that offers a choice: tapping it expands a stack of pills
/// (label + icon) upward from the button itself, over a dimmed backdrop.
/// The + turns into ×; a tap on the backdrop, Escape or the VoiceOver
/// escape gesture closes it. Same on iPhone and iPad (no action sheet, no
/// popover from the top). Place it as `.overlay(alignment: .bottomTrailing)`.
/// For a + that creates one thing, use `HFab`.
struct HFabMenu: View {
    private let label: String
    private let items: [HFabMenuItem]

    @State private var isOpen = false
    @State private var picks = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(label: String, items: [HFabMenuItem]) {
        self.label = label
        self.items = items
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if isOpen { backdrop }
            VStack(alignment: .trailing, spacing: 10) {
                if isOpen { pills }
                fab
            }
            .padding(.trailing, 18)
            .padding(.bottom, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        .sensoryFeedback(.selection, trigger: picks)
        .onDisappear { isOpen = false }
        #if DEBUG
        .task {
            guard DebugLaunchRoute.opensFabMenu else { return }
            try? await Task.sleep(for: .seconds(1))
            set(open: true)
        }
        #endif
    }

    // MARK: - Parts

    private var backdrop: some View {
        Color.black.opacity(0.28)
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture { set(open: false) }
            .transition(.opacity)
            .accessibilityHidden(true)
    }

    private var pills: some View {
        VStack(alignment: .trailing, spacing: 10) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                HFabMenuPill(item: item) {
                    picks += 1
                    set(open: false)
                    item.action()
                }
                .transition(pillTransition(index: index))
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { set(open: false) }
        .background {
            // Hardware keyboard (iPad): Escape closes.
            Button("Închide") { set(open: false) }
                .keyboardShortcut(.cancelAction)
                .hidden()
        }
    }

    private var fab: some View {
        HFab(isOpen ? "xmark" : "plus", label: isOpen ? "Închide meniul" : label) {
            set(open: !isOpen)
        }
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(isOpen ? "" : "Deschide opțiunile")
    }

    // MARK: - Motion

    private var animation: Animation {
        reduceMotion ? .easeInOut(duration: 0.2) : .spring(.snappy(duration: 0.3, extraBounce: 0.08))
    }

    private func pillTransition(index: Int) -> AnyTransition {
        guard !reduceMotion else { return .opacity }
        // Bottom pill first; each one a touch later going up.
        let delay = Double(items.count - 1 - index) * 0.03
        return .asymmetric(
            insertion: .scale(scale: 0.6, anchor: .bottomTrailing)
                .combined(with: .opacity)
                .combined(with: .offset(y: 16))
                .animation(animation.delay(delay)),
            removal: .opacity.combined(with: .scale(scale: 0.8, anchor: .bottomTrailing))
        )
    }

    private func set(open: Bool) {
        withAnimation(animation) { isOpen = open }
    }
}

// MARK: - Pill

private struct HFabMenuPill: View {
    let item: HFabMenuItem
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Text(item.title)
                    .font(AppFont.body(15, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(1)
                Image(systemName: item.systemImage)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.onPrimary)
                    .frame(width: 32, height: 32)
                    .background(AppTheme.Colors.primary, in: Circle())
                    .accessibilityHidden(true)
            }
            .padding(.leading, 16)
            .padding(.trailing, 6)
            .frame(minHeight: 44)
            .background(AppTheme.Colors.card, in: Capsule())
            .overlay(Capsule().strokeBorder(AppTheme.Colors.border, lineWidth: 1))
            .shadow(color: .black.opacity(0.14), radius: 10, y: 4)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
        .help(item.title)
    }
}

#Preview("HFabMenu") {
    ZStack {
        AppTheme.Colors.appBackground.ignoresSafeArea()
        Text("Conținut")
    }
    .overlay {
        HFabMenu(label: "Adaugă", items: [
            HFabMenuItem("Task nou", systemImage: "list.clipboard") {},
            HFabMenuItem("Comandă nouă", systemImage: "bag") {},
            HFabMenuItem("Rețetă nouă", systemImage: "book") {}
        ])
    }
}
