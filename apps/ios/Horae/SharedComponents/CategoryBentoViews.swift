import SwiftUI

// MARK: - Category bento (the "dial" the owner approved in Claude Design)
// No dropdowns: the categories are small tiles tinted in their super-category
// colour (count + prim/semi/finit label); empty ones are hidden; a parent with
// sub-categories shows them as pills underneath. `CategoryBentoView` is the
// recipe list's filter; `KindDialView` + `CategoryPillHeader` are the stock
// screens' three tiles (Materii prime / Semipreparate / Produse finite) and the
// per-category group headers.

enum CategoryKindStyle {
    /// Super-category in the fixed status palette (same as `StockKindPalette`):
    /// materii prime green, semipreparate blue, produse finite rose.
    static func tone(forKind kind: String?) -> AppTheme.Status.Kind? {
        switch kind {
        case "MATERIE_PRIMA": .ready
        case "SEMIPREPARAT": .inProgress
        case "PRODUS_FINIT", "FINAL": .new
        default: nil
        }
    }

    static func color(forKind kind: String?) -> Color {
        AppTheme.Status.color(tone(forKind: kind))
    }

    static func label(forKind kind: String?) -> String {
        switch kind {
        case "MATERIE_PRIMA": "prim"
        case "SEMIPREPARAT": "semi"
        case "PRODUS_FINIT", "FINAL": "finit"
        default: "misc"
        }
    }

    static func name(forKind kind: String) -> String {
        switch kind {
        case "MATERIE_PRIMA": "Materii prime"
        case "SEMIPREPARAT": "Semipreparate"
        case "PRODUS_FINIT", "FINAL": "Produse finite"
        default: kind
        }
    }
}

/// Colours of a tinted category control. A palette kind uses its own fg/wash
/// pair (≥4.5:1 on light and dark); an org hex colour only tints the surface
/// and the text stays ink, so any hex reads on any scheme. Selected = solid
/// fill with white or ink, whichever reaches 4.5:1.
struct CategoryTint {
    let color: Color
    let tone: AppTheme.Status.Kind?

    init(color: Color, tone: AppTheme.Status.Kind? = nil) {
        self.color = color
        self.tone = tone
    }

    init(hex: String?, kind: String?) {
        if let hex, let c = Color(hex: hex) {
            self.init(color: c)
        } else {
            let tone = CategoryKindStyle.tone(forKind: kind)
            self.init(color: AppTheme.Status.color(tone), tone: tone)
        }
    }

    func fill(_ on: Bool) -> Color {
        if on { return color }
        if let tone { return AppTheme.Status.bg(tone) }
        return color.opacity(AppSchemeStore.shared.scheme.isDark ? 0.3 : 0.18)
    }

    func text(_ on: Bool) -> Color {
        if on { return AppTheme.readableText(on: color) }
        return tone.map(AppTheme.Status.fg) ?? AppTheme.Colors.label
    }
}

/// One tile: whole card tinted; selected = solid colour.
private struct BentoTile: View {
    let title: String
    let count: Int
    let caption: String
    let tint: CategoryTint
    let isOn: Bool
    var compact = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(AppFont.body(compact ? 12 : 13, weight: .bold))
                    .lineLimit(1)
                HStack(alignment: .firstTextBaseline) {
                    Text("\(count)")
                        .font(AppFont.body(compact ? 16 : 18, weight: .bold))
                        .monospacedDigit()
                    Spacer(minLength: 4)
                    Text(caption.uppercased())
                        .font(AppFont.body(10, weight: .bold))
                        .tracking(0.6)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: compact ? 48 : 56, alignment: .leading)
            .background(tint.fill(isOn), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .foregroundStyle(tint.text(isOn))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(count)")
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
    }
}

/// The three super-category tiles under the location picker on stock screens.
struct KindDialView: View {
    /// (kind key, count) in display order; a kind with 0 items is hidden.
    let kinds: [(key: String, count: Int)]
    @Binding var selection: String?

    var body: some View {
        let shown = kinds.filter { $0.count > 0 }
        if !shown.isEmpty {
            HStack(spacing: 8) {
                ForEach(shown, id: \.key) { k in
                    let on = selection == k.key
                    BentoTile(
                        title: CategoryKindStyle.name(forKind: k.key),
                        count: k.count,
                        caption: CategoryKindStyle.label(forKind: k.key),
                        tint: CategoryTint(hex: nil, kind: k.key),
                        isOn: on,
                        compact: true
                    ) {
                        selection = on ? nil : k.key
                    }
                }
            }
            .padding(.horizontal, 20) // gutter insetGrouped
            .sensoryFeedback(.selection, trigger: selection)
        }
    }
}

/// Group header for a category inside a stock list: the category as a pill
/// (tinted in the kind colour) + "semi · 4" on the right.
struct CategoryPillHeader: View {
    let name: String
    let kind: String?
    let count: Int
    /// nil = plain header; otherwise the group collapses on tap (chevron shows the state).
    var isCollapsed: Bool? = nil
    var onToggle: (() -> Void)? = nil

    var body: some View {
        let tint = CategoryTint(hex: nil, kind: kind)
        let row = HStack {
            Text(name)
                .font(AppFont.body(12, weight: .bold))
                .padding(.horizontal, 10)
                .frame(minHeight: 26)
                .background(tint.fill(false), in: Capsule())
                .foregroundStyle(tint.text(false))
            Spacer()
            Text("\(CategoryKindStyle.label(forKind: kind)) · \(count)".uppercased())
                .font(AppFont.body(11, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            if let isCollapsed {
                Image(systemName: "chevron.down")
                    .font(AppFont.body(11, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .rotationEffect(.degrees(isCollapsed ? -90 : 0))
            }
        }
        .textCase(nil)
        .contentShape(Rectangle())
        if let onToggle {
            Button(action: onToggle) { row }
                .buttonStyle(.plain)
                .accessibilityLabel("\(name), \(count)")
                .accessibilityHint(isCollapsed == true ? "Deschide grupul" : "Închide grupul")
        } else {
            row
        }
    }
}

/// Recipe list filter: parent categories as tiles (count incl. children), the
/// chosen parent's sub-categories as pills. `selection` = parent or child name.
struct CategoryBentoView: View {
    let categories: [CarouselCategory]
    /// Recipes per category name ("" = uncategorized).
    let counts: [String: Int]
    @Binding var selection: String?

    private var parents: [CarouselCategory] {
        var seen = Set<String>()
        return categories.filter { $0.parentName == nil && !$0.name.isEmpty && seen.insert($0.name).inserted }
    }

    private func children(of parent: String) -> [CarouselCategory] {
        var seen = Set<String>()
        return categories.filter { $0.parentName == parent && seen.insert($0.name).inserted }
    }

    private func count(of parent: CarouselCategory) -> Int {
        (counts[parent.name] ?? 0) + children(of: parent.name).reduce(0) { $0 + (counts[$1.name] ?? 0) }
    }

    private var activeParent: String? {
        guard let selection else { return nil }
        return categories.first { $0.name == selection }?.parentName ?? selection
    }

    private var total: Int { counts.values.reduce(0, +) }

    var body: some View {
        let tiles = parents.filter { count(of: $0) > 0 }
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 8)], spacing: 8) {
                BentoTile(
                    title: "Toate", count: total, caption: "\(tiles.count) cat.",
                    tint: CategoryTint(color: AppTheme.Colors.label), isOn: selection == nil
                ) {
                    selection = nil
                }
                ForEach(tiles) { p in
                    let on = activeParent == p.name
                    BentoTile(
                        title: p.name,
                        count: count(of: p),
                        caption: CategoryKindStyle.label(forKind: p.kind),
                        tint: CategoryTint(hex: p.color, kind: p.kind),
                        isOn: on
                    ) {
                        selection = on ? nil : p.name
                    }
                }
            }
            if let activeParent {
                let subs = children(of: activeParent).filter { (counts[$0.name] ?? 0) > 0 }
                if !subs.isEmpty {
                    let parent = tiles.first { $0.name == activeParent }
                    let tint = parent.map { CategoryTint(hex: $0.color, kind: $0.kind) }
                        ?? CategoryTint(color: AppTheme.Colors.primary)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Text("\(activeParent) ›".uppercased())
                                .font(AppFont.body(11, weight: .bold)).tracking(1)
                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            ForEach(subs) { sub in
                                let on = selection == sub.name
                                Button {
                                    selection = on ? activeParent : sub.name
                                } label: {
                                    Text("\(sub.name) · \(counts[sub.name] ?? 0)")
                                        .font(AppFont.body(13, weight: .bold))
                                        .padding(.horizontal, 12)
                                        .frame(minHeight: 34)
                                        .background(tint.fill(on), in: Capsule())
                                        .foregroundStyle(tint.text(on))
                                        .contentShape(.interaction, Rectangle().inset(by: -5))
                                }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 20)
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// The category carousel under the kind tiles (and under the recipe type
/// tabs): flat chips as before, parents tinted in the kind colour, no "Toate"
/// — tapping the active chip clears the filter.
struct CategoryChipCarousel: View {
    let categories: [CarouselCategory]
    @Binding var selection: String?

    var body: some View {
        var seen = Set<String>()
        let chips = categories.filter { !$0.name.isEmpty && seen.insert($0.name).inserted }
        if !chips.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(chips) { chip in
                        let on = selection == chip.name
                        let fill = chip.parentName == nil
                            ? (chip.color.flatMap(Color.init(hex:)) ?? CategoryKindStyle.color(forKind: chip.kind))
                            : AppTheme.Colors.secondaryLabel
                        Button {
                            selection = on ? nil : chip.name
                        } label: {
                            Text(chip.name)
                                .font(AppFont.body(12, weight: .bold))
                                .padding(.horizontal, 12)
                                .frame(minHeight: 32)
                                .background(on ? fill : AppTheme.Colors.card, in: Capsule())
                                .overlay(Capsule().strokeBorder(on ? fill : AppTheme.Colors.border, lineWidth: 1))
                                .foregroundStyle(on ? AppTheme.readableText(on: fill) : AppTheme.Colors.label)
                                .contentShape(.interaction, Rectangle().inset(by: -6))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                    }
                }
                .padding(.horizontal, 20)
            }
            .sensoryFeedback(.selection, trigger: selection)
        }
    }
}

#Preview("Kind tiles + headers") {
    @Previewable @State var selection: String? = "SEMIPREPARAT"
    VStack(alignment: .leading, spacing: 12) {
        KindDialView(
            kinds: [("MATERIE_PRIMA", 42), ("SEMIPREPARAT", 9), ("PRODUS_FINIT", 14)],
            selection: $selection)
        CategoryPillHeader(name: "Creme", kind: "SEMIPREPARAT", count: 4)
            .padding(.horizontal, 20)
    }
    .padding(.vertical)
    .background(AppTheme.Colors.appBackground)
}
