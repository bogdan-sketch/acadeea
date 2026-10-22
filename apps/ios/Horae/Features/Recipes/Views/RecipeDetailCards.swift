import SwiftUI

// MARK: - Ingredients

/// "Ingrediente" card: ×1/×2/×6/×12 scale chips; each line shows the scaled
/// quantity and, for raw materials, the available stock (red when short).
struct RecipeIngredientsCard: View {
    let recipe: RecipeResponse
    @Binding var scale: Double

    private static let scales: [Double] = [1, 2, 6, 12]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("Ingrediente")
                    .font(AppFont.body(15, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 4)
                HStack(spacing: 4) {
                    ForEach(Self.scales, id: \.self) { s in scaleChip(s) }
                }
                .sensoryFeedback(.selection, trigger: scale)
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 8)

            ForEach(recipe.components) { component in
                if recipe.components.count > 1 {
                    Text(component.name.uppercased())
                        .font(AppFont.body(10, weight: .bold))
                        .tracking(0.5)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .top) { separator }
                }
                ForEach(component.ingredients) { ing in
                    row(ing, component: component.name)
                }
            }
        }
        .background(AppTheme.Colors.card, in: shape)
        .clipShape(shape)
        .overlay(shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
    }

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 16, style: .continuous) }

    private var separator: some View {
        Rectangle().fill(AppTheme.Colors.border).frame(height: 1)
    }

    private func scaleChip(_ s: Double) -> some View {
        let isOn = scale == s
        let label = "×\(Int(s))"
        return Button {
            withAnimation(.snappy(duration: 0.2)) { scale = s }
        } label: {
            Text(label)
                .font(AppFont.body(12, weight: .bold))
                .foregroundStyle(isOn ? AppTheme.Colors.onPrimary : AppTheme.Colors.label)
                .padding(.horizontal, 9)
                .frame(minHeight: 30)
                .background(isOn ? AppTheme.Colors.primary : AppTheme.Colors.card, in: Capsule())
                .overlay(Capsule().strokeBorder(isOn ? AppTheme.Colors.primary : AppTheme.Colors.border, lineWidth: 1))
                .contentShape(.interaction, Rectangle().inset(by: -6))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Cantități pentru \(Int(s)) șarje")
        .accessibilityAddTraits(isOn ? .isSelected : [])
        .help("Cantități pentru \(Int(s)) șarje")
    }

    private func row(_ ing: RecipeIngredient, component: String) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(ing.name)
                    .font(AppFont.body(14, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(2)
                Text(subtitle(ing, component: component))
                    .font(AppFont.body(11))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            Text(ing.unit.humanizedString(ing.quantity * scale))
                .font(AppFont.body(14, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(AppTheme.Colors.label)
                .fixedSize()
            stockColumn(ing)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(minHeight: 44)
        .overlay(alignment: .top) { separator }
        .accessibilityElement(children: .combine)
    }

    private func subtitle(_ ing: RecipeIngredient, component: String) -> String {
        var parts = [ing.isSemipreparat ? "Semipreparat" : "Materie primă"]
        if let prep = ing.prepMethod, !prep.isEmpty { parts.append(prep) } else if !component.isEmpty { parts.append(component) }
        return parts.joined(separator: " · ")
    }

    /// Available stock in the material's own unit; red when it does not cover
    /// the scaled need.
    @ViewBuilder
    private func stockColumn(_ ing: RecipeIngredient) -> some View {
        Group {
            if ing.isRawMaterial, let available = ing.availableStock {
                let stockUnit = ing.rawMaterialUnit ?? ing.unit
                let needed = (ing.unit.convert(ing.quantity, to: stockUnit) ?? ing.quantity) * scale
                let enough = available >= needed
                Text(stockUnit.stockDisplay(max(0, available)))
                    .foregroundStyle(AppTheme.Status.fg(enough ? .ready : .danger))
                    .accessibilityLabel(enough ? "Stoc suficient" : "Stoc insuficient")
                    .accessibilityValue(stockUnit.humanizedString(max(0, available)))
            } else {
                Text("—").foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .accessibilityHidden(true)
            }
        }
        .font(AppFont.body(11, weight: .bold))
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(width: 58, alignment: .trailing)
    }
}

// MARK: - Stock per location

/// "Stoc pe locații": produced stock per location with what is reserved.
struct RecipeLocationsCard: View {
    let unit: UnitType
    let availability: StockItemAvailability

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Stoc pe locații")
                    .font(AppFont.body(15, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .accessibilityAddTraits(.isHeader)
                if availability.locations.isEmpty {
                    Text("Fără stoc în nicio locație")
                        .font(AppFont.body(13))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
                ForEach(availability.locations) { loc in
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(loc.locationName)
                                .font(AppFont.body(14, weight: .semibold))
                                .foregroundStyle(AppTheme.Colors.label)
                            if loc.reservedCount > 0 {
                                Text("\(unit.humanizedString(loc.reservedCount)) rezervat")
                                    .font(AppFont.body(11))
                                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            }
                        }
                        Spacer()
                        Text(unit.stockDisplay(loc.quantity))
                            .font(AppFont.body(14, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(loc.quantity > 0 ? AppTheme.Status.fg(.ready) : AppTheme.Colors.secondaryLabel)
                    }
                    .accessibilityElement(children: .combine)
                }
                if availability.activeTaskCount > 0 {
                    Text("\(availability.activeTaskCount) \(availability.activeTaskCount == 1 ? "task activ" : "taskuri active") în producție")
                        .font(AppFont.body(11))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
        }
    }
}

// MARK: - Print sheet

/// Recipe sheet for AirPrint: meta + ingredients at the chosen scale.
enum RecipePrintSheet {
    static func html(_ recipe: RecipeResponse, scale: Double) -> String {
        func esc(_ s: String) -> String {
            s.replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;")
        }
        var body = "<h1>\(esc(recipe.name))</h1>"
        body += "<p class=\"meta\">Randament: \(esc(recipe.unit.humanizedString(recipe.yieldQuantity * scale)))"
        if scale != 1 { body += " (×\(Int(scale)))" }
        if let category = recipe.category { body += " · Categorie: \(esc(category))" }
        body += " · Versiunea \(recipe.version)</p>"
        for component in recipe.components {
            body += "<table><tr><th>\(esc(component.name))</th><th>Cantitate</th><th>Preparare</th></tr>"
            for ing in component.ingredients {
                body += "<tr><td>\(esc(ing.name))</td><td>\(esc(ing.unit.humanizedString(ing.quantity * scale)))</td><td>\(esc(ing.prepMethod ?? ""))</td></tr>"
            }
            body += "</table>"
        }
        body += "<p class=\"small\">Tipărit \(Date().dottedDateTime)</p>"
        return HTMLPrinter.document(title: recipe.name, body: body)
    }
}
