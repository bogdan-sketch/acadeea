import SwiftUI

/// Web-style recipe grid (`RecipeCardsRollout`): adaptive columns (min 300pt)
/// (2–3 on iPad, one on iPhone). Out-of-stock recipes go last (stable within
/// each group) and carry a "Pornește rețeta" button → Task nou with the
/// recipe preselected. Tapping a card opens the recipe detail.
struct RecipeCardGrid: View {
    let recipes: [RecipeResponse]
    let selection: BulkSelection
    var onCardAppear: (RecipeResponse) -> Void = { _ in }

    @Environment(\.routeNavigator) private var navigator

    private var canStart: Bool { AuthManager.shared.permissionManager.can(.create, .Task) }

    /// Out of stock last; `enumerated` keeps the server order inside each group.
    private var ordered: [RecipeResponse] {
        recipes.enumerated()
            .sorted { a, b in
                let ao = RecipeStockState(a.element) == .out, bo = RecipeStockState(b.element) == .out
                return ao == bo ? a.offset < b.offset : !ao
            }
            .map(\.element)
    }

    /// Web `minmax(300px, 1fr)`: 2–3 columns on iPad, 1 on every iPhone
    /// (≤ 440pt wide minus gutters < 2 × 300).
    /// Compact cards: 2 per row on iPhone, 4–6 on iPad (owner: "să încapă mai multe").
    private let columns = [GridItem(.adaptive(minimum: 160), spacing: 10, alignment: .top)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(ordered) { recipe in
                card(recipe).onAppear { onCardAppear(recipe) }
            }
        }
    }

    @ViewBuilder
    private func card(_ recipe: RecipeResponse) -> some View {
        if selection.isActive {
            let isOn = selection.contains(recipe.id)
            Button { selection.toggle(recipe.id) } label: {
                RecipeCardTile(recipe: recipe, selected: isOn)
            }
            .buttonStyle(RecipeCardPressStyle())
            .accessibilityAddTraits(isOn ? .isSelected : [])
            .accessibilityHint(isOn ? "Deselectează" : "Selectează")
        } else {
            NavigationLink(value: Route.recipeDetail(id: recipe.id)) {
                RecipeCardTile(recipe: recipe)
            }
            .buttonStyle(RecipeCardPressStyle())
            .hoverEffect(.lift)
            .overlay(alignment: .bottom) {
                if RecipeStockState(recipe) == .out && canStart {
                    startButton(recipe)
                }
            }
        }
    }

    /// Filled accent button on out-of-stock cards (web shows it on hover;
    /// touch has no hover, so it is always visible here).
    private func startButton(_ recipe: RecipeResponse) -> some View {
        Button {
            navigator.push(.taskCreateFromRecipe(recipeId: recipe.id))
        } label: {
            Label("Pornește", systemImage: "play.fill")
                .font(AppFont.body(12.5, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.onPrimary)
                .frame(maxWidth: .infinity, minHeight: 34)
                .background(AppTheme.Colors.primary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 10)
        .padding(.bottom, 10)
        .accessibilityLabel("Pornește rețeta \(recipe.name)")
        .help("Pornește un task de producție din rețetă")
    }
}

/// Press feedback for recipe cards: slight scale-down + softer shadow
/// (web hover lift). No scale with Reduce Motion.
struct RecipeCardPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .shadow(color: .black.opacity(configuration.isPressed ? 0.12 : 0.05),
                    radius: configuration.isPressed ? 10 : 3, y: configuration.isPressed ? 5 : 1)
            .animation(.spring(.snappy), value: configuration.isPressed)
    }
}

#Preview("Recipe cards") {
    ScrollView {
        RecipeCardGrid(recipes: [], selection: BulkSelection())
            .padding()
    }
    .environment(AppSchemeStore.shared)
}
