import SwiftUI

/// Recipe card from the web catalogue (`recipe-card.tsx`): a 200pt category-
/// tinted tile with the faded category drawing top-right, stock number +
/// category pill on top, the recipe name bottom-left. Out of stock: grayscale,
/// "Fără stoc" pill and room for the "Pornește rețeta" button the grid
/// overlays. Rendered only where `RecipeCardsRollout` says so.
struct RecipeCardTile: View {
    let recipe: RecipeResponse
    /// Bulk selection: nil = not selecting; otherwise whether this card is on.
    var selected: Bool?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let height: CGFloat = 150
    /// Height of the start button + its gap, reserved under the name when out of stock.
    static let startButtonSpace: CGFloat = 42

    private var tint: RecipeTint { RecipeTint.forCategory(recipe.category, scheme: AppSchemeStore.shared.scheme) }
    private var stock: RecipeStockState? { RecipeStockState(recipe) }
    private var isOut: Bool { stock == .out }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            topRow
            Spacer(minLength: 8)
            RecipeCardName(name: recipe.name)
                .padding(.bottom, isOut && selected == nil ? Self.startButtonSpace : 0)
        }
        .padding(.horizontal, 12)
        .padding(.top, 11)
        .padding(.bottom, 12)
        // 200pt at default text size; grows with Dynamic Type instead of clipping.
        .frame(maxWidth: .infinity, minHeight: Self.height, alignment: .topLeading)
        .background { surface }
        .clipShape(shape)
        .overlay {
            shape.strokeBorder(selected == true ? AppTheme.Colors.primary : AppTheme.Colors.border,
                               lineWidth: selected == true ? 2 : 1)
        }
        .contentShape(shape)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 16, style: .continuous) }

    // MARK: - Surface

    /// Tint + top-right ink glow (web `.tint-tile`) + the cropped drawing.
    private var surface: some View {
        ZStack(alignment: .topTrailing) {
            Rectangle().fill(tint.fill)
            EllipticalGradient(
                colors: [tint.ink.opacity(0.18), tint.ink.opacity(0)],
                center: .topTrailing, startRadiusFraction: 0, endRadiusFraction: 0.75)
            CategoryArt(kind: RecipeCategoryKey.art(recipe.category, recipeType: recipe.type))
                .foregroundStyle(tint.ink)
                .opacity(AppSchemeStore.shared.scheme.isDark ? 0.18 : 0.2)
                .frame(width: 96, height: 96)
                .rotationEffect(.degrees(reduceMotion ? 0 : -8))
                .offset(x: 16, y: 36)
        }
        .saturation(isOut ? 0.15 : 1)
        .accessibilityHidden(true)
    }

    // MARK: - Top row

    private var topRow: some View {
        HStack(alignment: .top, spacing: 12) {
            if let selected {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(selected ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryLabel)
                    .background(AppTheme.Colors.card, in: Circle())
                    .accessibilityHidden(true)
            } else if let stock {
                switch stock {
                case .ok, .low: stockNumber
                case .out: RecipeCardPill(text: "Fără stoc", muted: true)
                }
            }
            Spacer(minLength: 0)
            if let category = recipe.category, !category.isEmpty {
                RecipeCardPill(text: category, dot: tint.ink)
            }
        }
    }

    /// "160" + "buc în stoc" ("1,5" + "kg în stoc").
    private var stockNumber: some View {
        let full = recipe.unit.humanizedString(max(0, recipe.stockCount ?? 0))
        let parts = full.split(separator: " ", maxSplits: 1).map(String.init)
        return VStack(alignment: .leading, spacing: 4) {
            Text(parts.first ?? full)
                .font(AppFont.display(17))
                .monospacedDigit()
                .foregroundStyle(AppTheme.Colors.label)
            Text(parts.count > 1 ? "\(parts[1]) în stoc" : "în stoc")
                .font(AppFont.body(10.5, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.label.opacity(0.7))
        }
        .lineLimit(1)
    }

    private var accessibilityText: String {
        var parts = [recipe.name]
        if let category = recipe.category, !category.isEmpty { parts.append(category) }
        switch stock {
        case .out: parts.append("fără stoc")
        case .ok, .low: parts.append("\(recipe.unit.humanizedString(recipe.stockCount ?? 0)) în stoc")
        case nil: break
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Stock state

/// Web `stockState`: out = nothing on hand; low = everything on hand reserved.
enum RecipeStockState: Equatable {
    case ok, low, out

    init?(_ recipe: RecipeResponse) {
        guard let count = recipe.stockCount else { return nil }
        if count <= 0 { self = .out }
        else if let reserved = recipe.reservedCount, count - reserved <= 0 { self = .low }
        else { self = .ok }
    }
}

// MARK: - Pieces

/// Recipe name: Fraunces 21, ALL-CAPS names a step smaller (17) with a hair
/// of tracking so shouted and mixed-case cards weigh the same.
private struct RecipeCardName: View {
    let name: String

    private var isShouted: Bool {
        let letters = name.filter(\.isLetter)
        guard letters.count >= 6 else { return false }
        return Double(letters.filter(\.isUppercase).count) / Double(letters.count) > 0.6
    }

    var body: some View {
        Text(name)
            .font(AppFont.title(isShouted ? 13 : 15.5))
            .tracking(isShouted ? 0.2 : -0.2)
            .lineSpacing(isShouted ? 3 : 2)
            .foregroundStyle(AppTheme.Colors.label)
            .lineLimit(4)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Frosted pill on the tile: category (with ink dot) or "Fără stoc".
private struct RecipeCardPill: View {
    let text: String
    var dot: Color?
    var muted = false

    var body: some View {
        HStack(spacing: 6) {
            if let dot {
                Circle().fill(dot).frame(width: 6, height: 6).accessibilityHidden(true)
            }
            Text(text)
                .font(AppFont.body(10.5, weight: .semibold))
                .foregroundStyle(muted ? AppTheme.Colors.secondaryLabel : AppTheme.Colors.label)
                .lineLimit(1)
        }
        .padding(.leading, dot == nil ? 10 : 8)
        .padding(.trailing, 10)
        .frame(minHeight: 24)
        .background(AppTheme.Colors.card.opacity(muted ? 0.8 : 0.85), in: Capsule())
        .shadow(color: .black.opacity(muted ? 0 : 0.06), radius: 1.5, y: 1)
    }
}
