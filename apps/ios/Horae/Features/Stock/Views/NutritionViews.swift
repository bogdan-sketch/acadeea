import SwiftUI

// MARK: - Nutrition sections (feature-gated by BrandingManager.nutritionEnabled)

// Standard nutrition-label order: energy, fat (+saturates), carbs (+sugars),
// protein, fibre, salt. `sub` rows render indented under their parent.
private let nutritionFields: [(label: String, unit: String, keyPath: WritableKeyPath<NutritionValues, Double?>, sub: Bool)] = [
    ("Valoare energetică", "kcal", \.calories, false),
    ("Grăsimi", "g", \.fat, false),
    ("din care acizi grași saturați", "g", \.saturatedFat, true),
    ("Glucide", "g", \.carbs, false),
    ("din care zaharuri", "g", \.sugars, true),
    ("Proteine", "g", \.protein, false),
    ("Fibre", "g", \.fiber, false),
    ("Sare", "g", \.salt, false),
]

private func fmt(_ n: Double) -> String { n.qtyFormatted }

/// kcal → kJ (1 kcal = 4.184 kJ) for the energy row's dual display.
private func kJ(_ kcal: Double) -> Double { kcal * 4.184 }

/// Editable "per 100 g / 100 ml" nutrition card for the raw-material detail.
struct NutritionEditorSection: View {
    let rawMaterialId: String
    let initial: NutritionValues?
    var initialAllergens: [String] = []
    var canEdit: Bool

    @State private var values = NutritionValues()
    @State private var allergens: Set<String> = []
    @State private var isSaving = false
    @State private var saved = false
    @State private var error: APIError?

    @State private var isEditing = false

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 8) {
                StockCardTitle("Valori nutriționale și alergeni") {
                    // Editarea porneste explicit — in view mode totul e read-only.
                    if canEdit && !isEditing {
                        HIconButton("pencil", label: "Editează valorile nutriționale") {
                            isEditing = true
                        }
                    }
                }
                Text("per 100 g / 100 ml")
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                if isEditing {
                    editorRows
                } else {
                    readOnlyRows
                }
                Text("Alergenii bifați se propagă automat în fiecare semipreparat și produs finit care folosește materia.")
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .padding(.top, 4)
            }
        }
        .onAppear {
            values = initial ?? NutritionValues()
            allergens = Set(initialAllergens)
        }
        .errorAlert($error)
    }

    // MARK: - Read-only (view mode)

    @ViewBuilder
    private var readOnlyRows: some View {
        // Afisarea read-only vine DIRECT din props — state-ul (umplut in
        // onAppear) e doar pentru editare; altfel alergenii pot lipsi la view.
        let shown = initial ?? NutritionValues()
        let filled = nutritionFields.filter { shown[keyPath: $0.keyPath] != nil }
        if filled.isEmpty && initialAllergens.isEmpty {
            Text("Nicio valoare nutrițională completată.")
                .font(AppFont.body(13))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
        }
        ForEach(filled.indices, id: \.self) { i in
            let field = filled[i]
            if i > 0 { StockDivider() }
            StockInfoRow(field.label, "\((shown[keyPath: field.keyPath] ?? 0).qtyFormatted) \(field.unit)")
        }
        if !initialAllergens.isEmpty {
            StockDivider()
            StockInfoRow("Alergeni", Allergen.allCases
                .filter { initialAllergens.contains($0.rawValue) }
                .map(\.displayName)
                .joined(separator: ", "))
        }
    }

    // MARK: - Editor (edit mode)

    @ViewBuilder
    private var editorRows: some View {
        ForEach(nutritionFields.indices, id: \.self) { i in
            let field = nutritionFields[i]
            HStack {
                Text(field.label)
                    .font(AppFont.body(13))
                    .foregroundStyle(field.sub ? AppTheme.Colors.secondaryLabel : AppTheme.Colors.label)
                    .padding(.leading, field.sub ? AppTheme.Spacing.md : 0)
                Spacer()
                TextField("—", value: binding(field.keyPath), format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .font(AppFont.body(14, weight: .semibold))
                    .frame(width: 76)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 8)
                    .background(AppTheme.Colors.appBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .accessibilityLabel(field.label)
                Text(field.unit)
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .frame(width: 34, alignment: .leading)
            }
        }
        // EU-14 allergens — propagated into every product using this material.
        HSectionHeader("Alergeni").padding(.top, 6)
        StockFlowLayout(spacing: 6) {
            ForEach(Allergen.allCases) { allergen in
                HChip(allergen.displayName, isSelected: allergens.contains(allergen.rawValue)) {
                    if allergens.contains(allergen.rawValue) {
                        allergens.remove(allergen.rawValue)
                    } else {
                        allergens.insert(allergen.rawValue)
                    }
                    saved = false
                }
            }
        }
        HStack(spacing: 10) {
            Button {
                // Renunta: revine la valorile initiale.
                values = initial ?? NutritionValues()
                allergens = Set(initialAllergens)
                isEditing = false
            } label: {
                Text("Renunță")
                    .font(AppFont.body(14, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(AppTheme.Colors.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            Button {
                Task {
                    await save()
                    if error == nil { isEditing = false }
                }
            } label: {
                HStack(spacing: 6) {
                    if isSaving { ProgressView().tint(AppTheme.Colors.onPrimary) }
                    Text(saved ? "Salvat" : "Salvează")
                }
                .font(AppFont.body(14, weight: .bold))
                .foregroundStyle(AppTheme.Colors.onPrimary)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(AppTheme.Colors.primary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
        }
        .padding(.top, 6)
    }

    private func binding(_ keyPath: WritableKeyPath<NutritionValues, Double?>) -> Binding<Double?> {
        Binding(
            get: { values[keyPath: keyPath] },
            set: { values[keyPath: keyPath] = $0; saved = false }
        )
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await StockService.shared.updateRawMaterialNutrition(
                id: rawMaterialId,
                nutrition: values.isEmpty ? nil : values,
                allergens: allergens.sorted()
            )
            saved = true
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

/// Read-only aggregated nutrition section for the recipe detail.
struct RecipeNutritionSection: View {
    let recipeId: String

    @State private var result: RecipeNutritionResult?

    var body: some View {
        Group {
            if let result, result.coveredCount > 0 {
                Section {
                    ForEach(nutritionFields.indices, id: \.self) { i in
                        let field = nutritionFields[i]
                        HStack {
                            Text(field.label)
                                .foregroundStyle(field.sub ? .secondary : .primary)
                                .padding(.leading, field.sub ? AppTheme.Spacing.md : 0)
                            Spacer()
                            Text(cell(result.total, field.keyPath, field.unit))
                                .font(.subheadline.weight(.medium))
                            if result.yieldQuantity > 1 {
                                Text(cell(result.perPiece, field.keyPath, field.unit))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .frame(width: 84, alignment: .trailing)
                            }
                        }
                    }
                } header: {
                    HStack {
                        Text("Valori nutritionale")
                        Spacer()
                        if result.yieldQuantity > 1 {
                            Text("total · per buc")
                        }
                    }
                } footer: {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                        if result.missing.isEmpty {
                            if let per100 = result.per100g, let kcal = per100.calories {
                                Text("~\(fmt(kcal)) kcal / 100g de produs.")
                            }
                        } else {
                            Text("Calcul parțial (\(result.coveredCount)/\(result.ingredientCount) ingrediente) — fără date pentru: \(result.missing.map(\.title).joined(separator: ", ")).")
                        }
                        if result.per100Basis == "finished" {
                            Text("Valorile la 100 g sunt calculate pe greutatea produsului finit (\(fmt(result.finishedWeightGrams ?? 0)) g).")
                        } else {
                            Text("Valorile la 100 g sunt pe greutatea ingredientelor. Adaugă greutatea produsului finit în rețetă pentru valori corecte după coacere.")
                        }
                        if !result.allergens.isEmpty {
                            Text("Contine alergeni: " + result.allergens.map { entry in
                                let name = Allergen(rawValue: entry.allergen)?.displayName ?? entry.allergen
                                return "\(name) (\(entry.sources.joined(separator: ", ")))"
                            }.joined(separator: ", "))
                            .fontWeight(.medium)
                        }
                        Text("Valorile sunt cu scop informativ.")
                    }
                }
            } else if let result {
                // Explicit empty state — a silently missing section reads as a bug.
                Section("Valori nutritionale") {
                    Text(
                        "Nicio materie primă din rețetă nu are valori nutriționale completate. "
                            + "Adaugă valorile (per 100 g) pe paginile materiilor prime"
                            + (result.missing.isEmpty
                                ? "."
                                : ": \(result.missing.map(\.title).joined(separator: ", ")).")
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    if !result.allergens.isEmpty {
                        Text("Contine alergeni: " + result.allergens.map { entry in
                            Allergen(rawValue: entry.allergen)?.displayName ?? entry.allergen
                        }.joined(separator: ", "))
                        .font(.footnote.weight(.medium))
                    }
                }
            }
        }
        .task { result = try? await StockService.shared.fetchRecipeNutrition(recipeId: recipeId) }
    }

    private func cell(_ v: NutritionValues, _ keyPath: WritableKeyPath<NutritionValues, Double?>, _ unit: String) -> String {
        let value = v[keyPath: keyPath] ?? 0
        if keyPath == \NutritionValues.calories {
            return "\(fmt(kJ(value))) kJ / \(fmt(value)) kcal"
        }
        return "\(fmt(value)) \(unit)"
    }
}
