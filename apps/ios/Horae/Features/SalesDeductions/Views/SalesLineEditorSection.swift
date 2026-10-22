import SwiftUI

/// One reviewable line of a DRAFT, as its own inset-grouped Section.
/// Mirrors web `LineEditor`: report name + match badge, decision segmented
/// control, then per decision the product/quantity/stock editor, the new-product
/// form, or the "ignored" note.
struct SalesLineEditorSection: View {
    @Bindable var viewModel: SalesDeductionConfirmViewModel
    let rowKey: String
    let onPickProduct: () -> Void

    private static let newProductUnits: [UnitType] = [.BUCATI, .KILOGRAME, .GRAME, .LITRI]

    var body: some View {
        if let row = viewModel.row(rowKey) {
            let c = viewModel.computed[rowKey]
            let product = row.recipeId.flatMap { viewModel.productById[$0] }
            Section {
                header(row)
                Picker("Decizie", selection: Binding(
                    get: { row.decision },
                    set: { viewModel.setDecision(rowKey, $0) }
                )) {
                    ForEach(SalesDeductionDecision.allCases) { Text($0.displayName).tag($0) }
                }
                .pickerStyle(.segmented)
                .accessibilityLabel("Decizie pentru \(viewModel.name(of: row))")

                switch row.decision {
                case .ACCEPT:
                    productButton(row, product: product)
                    quantityStepper(row)
                    if let product, let c {
                        LabeledContent("Stoc") {
                            Text("\(c.before.qtyFormatted) → \(c.after.qtyFormatted) \(product.unit.abbreviation)")
                                .monospacedDigit()
                        }
                        SalesStockResolutionRows(viewModel: viewModel, row: row, computed: c, unit: product.unit)
                    }
                case .CREATE_NEW:
                    newProductFields
                case .DECLINE:
                    Text("Nu se modifică nimic pentru acest rând.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                if row.isManual {
                    Button(role: .destructive) {
                        withAnimation(.spring(.smooth)) { viewModel.remove(rowKey) }
                    } label: {
                        Label("Șterge rândul", systemImage: "trash")
                    }
                }
            } footer: {
                if viewModel.showInvalid, let missing = c?.invalid {
                    Text("Lipsește: \(missing)")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AppTheme.Colors.destructive)
                }
            }
            .opacity(row.decision == .DECLINE ? 0.7 : 1)
        }
    }

    // MARK: - Rows

    @ViewBuilder
    private func header(_ row: SalesLineDraft) -> some View {
        if row.isManual {
            Text("ADĂUGAT MANUAL")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Text(row.rawName).font(.headline)
                HStack(spacing: AppTheme.Spacing.sm) {
                    if let reported = row.quantityReported {
                        Text("raport: \(reported.qtyFormatted) \(row.rawUnit ?? "")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    SalesMatchBadge(kind: row.matchKind, score: row.matchScore)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func productButton(_ row: SalesLineDraft, product: SalesProductOption?) -> some View {
        let suggestion = row.candidates.first { viewModel.productById[$0.id] != nil }
        return Button(action: onPickProduct) {
            HStack {
                Text("Produs").foregroundStyle(.primary)
                Spacer(minLength: AppTheme.Spacing.sm)
                Group {
                    if let product {
                        Text(product.name).foregroundStyle(.primary)
                    } else if let suggestion {
                        Text("Sugestie: \(suggestion.name)?").foregroundStyle(AppTheme.Colors.warning)
                    } else {
                        Text("Alege produsul").foregroundStyle(AppTheme.Colors.warning)
                    }
                }
                .lineLimit(2)
                .multilineTextAlignment(.trailing)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Alege produsul din aplicație")
    }

    private func quantityStepper(_ row: SalesLineDraft) -> some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            Text("Vândut")
            Spacer(minLength: AppTheme.Spacing.sm)
            stepButton(icon: "minus", label: "Scade 1") { viewModel.step(rowKey, by: -1) }
            TextField("0", text: binding(\.qty, fallback: ""))
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.center)
                .font(.body.weight(.semibold).monospacedDigit())
                .frame(minWidth: 56, maxWidth: 88)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Cantitate vândută")
            stepButton(icon: "plus", label: "Adaugă 1") { viewModel.step(rowKey, by: 1) }
        }
    }

    private func stepButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.body.weight(.semibold))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private var newProductFields: some View {
        Label {
            TextField("Nume produs nou", text: binding(\.newName, fallback: ""))
        } icon: {
            Image(systemName: "plus.app.fill").foregroundStyle(AppTheme.Colors.primaryText).accessibilityHidden(true)
        }
        LabeledContent("Unitate") {
            ChoiceChips(
                options: Self.newProductUnits,
                title: \.abbreviation,
                selection: binding(\.newUnit, fallback: .BUCATI),
                accessibilityLabel: "Unitate"
            )
        }
        VStack(alignment: .leading, spacing: 4) {
            Text("Categorie")
            OptionalChoiceChips(
                options: viewModel.finishedCategories,
                title: { $0 },
                selection: binding(\.newCategory, fallback: nil),
                noneTitle: "Fără categorie",
                accessibilityLabel: "Categorie"
            )
        }
        LabeledContent("Stoc acum") {
            TextField("0", text: binding(\.newStock, fallback: ""))
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 120)
                .accessibilityLabel("Stocul actual al produsului nou")
        }
    }

    private func binding<T>(_ keyPath: WritableKeyPath<SalesLineDraft, T>, fallback: T) -> Binding<T> {
        viewModel.binding(rowKey, keyPath, fallback: fallback)
    }
}

/// Negative-quantity note, shortfall warning with "oprește la 0" vs "suprascrie
/// stocul", and the plain "Suprascrie stocul" shortcut — web's sub-rows.
private struct SalesStockResolutionRows: View {
    @Bindable var viewModel: SalesDeductionConfirmViewModel
    let row: SalesLineDraft
    let computed: SalesLineComputed
    let unit: UnitType

    var body: some View {
        if let q = computed.qty, q < 0 {
            Label("Cantitate negativă: se adaugă înapoi \((-q).qtyFormatted) \(unit.abbreviation) în stoc.",
                  systemImage: "arrow.uturn.backward.circle.fill")
                .font(.caption)
                .foregroundStyle(AppTheme.Colors.success)
        }
        if computed.shortfall > 0 || row.stockMode != .normal {
            if computed.shortfall > 0 {
                Label("Ai vândut \((computed.qty ?? 0).qtyFormatted), dar în stoc sunt doar \(computed.before.qtyFormatted). Stocul nu poate fi negativ.",
                      systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(computed.unresolved ? AppTheme.Colors.warning : .secondary)
                radio("Scade până la 0 (vânzarea rămâne înregistrată: \((computed.qty ?? 0).qtyFormatted))",
                      selected: row.stockMode == .clamp) {
                    viewModel.update(row.id) { $0.stockMode = .clamp }
                }
            }
            radio("Suprascrie stocul", selected: row.stockMode == .override) {
                viewModel.update(row.id) { $0.stockMode = .override }
            }
            if row.stockMode == .override {
                LabeledContent("Stoc nou (\(unit.abbreviation))") {
                    TextField("0", text: viewModel.binding(row.id, \.override, fallback: ""))
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 120)
                        .accessibilityLabel("Stocul suprascris")
                }
            }
            if row.stockMode != .normal && computed.shortfall == 0 {
                Button("Anulează suprascrierea") {
                    viewModel.update(row.id) { $0.stockMode = .normal; $0.override = "" }
                }
                .font(.subheadline)
            }
        } else {
            Button("Suprascrie stocul") {
                viewModel.update(row.id) { $0.stockMode = .override }
            }
            .font(.subheadline)
        }
    }

    private func radio(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label {
                Text(title).font(.subheadline).foregroundStyle(.primary)
            } icon: {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? AppTheme.Colors.primaryText : .secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

extension SalesDeductionConfirmViewModel {
    /// Two-way binding to one field of one row (rows are looked up by key so
    /// filtering never shifts which row a field edits).
    func binding<T>(_ key: String, _ keyPath: WritableKeyPath<SalesLineDraft, T>, fallback: T) -> Binding<T> {
        Binding(
            get: { self.row(key)?[keyPath: keyPath] ?? fallback },
            set: { value in self.update(key) { $0[keyPath: keyPath] = value } }
        )
    }
}
