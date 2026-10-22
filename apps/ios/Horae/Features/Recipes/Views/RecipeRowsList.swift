import SwiftUI

/// Rețete without photos (feature flag `RecipePhotos.enabled` off): the Stoc list
/// look — one card per category (pill header, collapsible), a row per recipe
/// with name, batch yield · price, stock on the right and a chevron.
struct RecipeRowsList: View {
    let recipes: [RecipeResponse]
    /// Carousel order of the categories; "Fără categorie" goes last.
    let categoryOrder: [String]
    let kind: String
    let selection: BulkSelection
    var onRowAppear: (RecipeResponse) -> Void = { _ in }

    @State private var collapsed: Set<String> = []
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        if sizeClass == .regular {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 12, alignment: .top)],
                      alignment: .leading, spacing: 12) {
                ForEach(sections, id: \.title) { groupCard($0) }
            }
        } else {
            LazyVStack(spacing: 8) {
                ForEach(sections, id: \.title) { groupCard($0) }
            }
        }
    }

    // MARK: - Sections

    private var sections: [(title: String, recipes: [RecipeResponse])] {
        var order: [String] = []
        var byCategory: [String: [RecipeResponse]] = [:]
        for recipe in recipes {
            let key = recipe.category.flatMap { $0.isEmpty ? nil : $0 } ?? StockText.noCategory
            if byCategory[key] == nil { order.append(key) }
            byCategory[key, default: []].append(recipe)
        }
        let rank = Dictionary(categoryOrder.enumerated().map { ($1, $0) }, uniquingKeysWith: { first, _ in first })
        order.sort { a, b in
            if a == StockText.noCategory { return false }
            if b == StockText.noCategory { return true }
            return (rank[a] ?? Int.max, a) < (rank[b] ?? Int.max, b)
        }
        return order.map { (title: $0, recipes: byCategory[$0] ?? []) }
    }

    private func groupCard(_ section: (title: String, recipes: [RecipeResponse])) -> some View {
        StockGroupCard(
            title: section.title,
            kind: kind,
            count: section.recipes.count,
            isCollapsed: collapsed.contains(section.title),
            onToggle: {
                withAnimation(.snappy) {
                    if collapsed.contains(section.title) {
                        collapsed.remove(section.title)
                    } else {
                        collapsed.insert(section.title)
                    }
                }
            }
        ) {
            ForEach(section.recipes) { recipe in
                row(recipe).onAppear { onRowAppear(recipe) }
            }
        }
    }

    // MARK: - Row

    @ViewBuilder
    private func row(_ recipe: RecipeResponse) -> some View {
        if selection.isActive {
            let isOn = selection.contains(recipe.id)
            Button { selection.toggle(recipe.id) } label: {
                HStack(spacing: 0) {
                    Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isOn ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryLabel)
                        .padding(.leading, 14)
                        .accessibilityHidden(true)
                    itemRow(recipe)
                }
                .overlay(alignment: .top) { Rectangle().fill(AppTheme.Colors.border).frame(height: 1) }
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isOn ? .isSelected : [])
            .accessibilityHint(isOn ? "Deselectează" : "Selectează")
        } else {
            NavigationLink(value: Route.recipeDetail(id: recipe.id)) {
                itemRow(recipe).masterDetailHighlight(.recipeDetail(id: recipe.id))
            }
            .buttonStyle(.plain)
        }
    }

    private func itemRow(_ recipe: RecipeResponse) -> some View {
        StockItemRow(
            title: recipe.name,
            subtitle: meta(recipe),
            quantity: recipe.stockCount.map { recipe.unit.stockDisplay($0) } ?? "—",
            status: (recipe.stockCount ?? 1) <= 0 ? .danger : .ready
        )
    }

    /// "1 kg / șarjă · 145,00 lei" (+ "schiță" / "arhivată").
    private func meta(_ recipe: RecipeResponse) -> String {
        var parts = ["\(recipe.unit.humanizedString(recipe.yieldQuantity)) / șarjă"]
        if let price = recipe.sellingPrice { parts.append(price.ronFormatted) }
        if recipe.isDraft { parts.append("schiță") }
        if recipe.isArchived { parts.append("arhivată") }
        return parts.joined(separator: " · ")
    }
}
