import SwiftUI
import Observation

// MARK: - View Model

@Observable
final class RequirementsPlanViewModel {
    struct PlanRow: Identifiable {
        let id = UUID()
        let recipeId: String
        let recipeName: String
        let unit: UnitType
        var quantity: Double
    }

    var rows: [PlanRow] = []
    var result: RequirementsPlanResult?
    var isComputing = false
    var isExporting = false
    var shareURL: URL?
    var error: APIError?

    private let service = StockService.shared

    var validItems: [RequirementsPlanRequestItem] {
        rows.filter { $0.quantity > 0 }
            .map { RequirementsPlanRequestItem(recipeId: $0.recipeId, quantity: $0.quantity) }
    }

    func addRecipe(id: String, name: String, unit: UnitType, yieldQuantity: Double) {
        guard !rows.contains(where: { $0.recipeId == id }) else { return }
        rows.append(PlanRow(recipeId: id, recipeName: name, unit: unit, quantity: yieldQuantity))
        result = nil
        shareURL = nil
    }

    func compute() async {
        isComputing = true
        defer { isComputing = false }
        shareURL = nil
        do {
            result = try await service.planRequirements(items: validItems)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Download the xlsx and stage it in a temp file the share sheet can hand off.
    func export() async {
        isExporting = true
        defer { isExporting = false }
        do {
            let data = try await service.exportRequirementsPlan(items: validItems)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("necesar-mp.xlsx")
            try data.write(to: url, options: .atomic)
            shareURL = url
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

// MARK: - View

/// Ad-hoc production planning: pick products + quantities, get the aggregated
/// raw-material needs (with supplier + purchase deficit) and export to Excel.
struct RequirementsPlanView: View {
    @State private var viewModel = RequirementsPlanViewModel()
    @State private var showRecipePicker = false

    var body: some View {
        List {
            planSection
            if let result = viewModel.result {
                resultsSection(result)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Necesar MP")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if let url = viewModel.shareURL {
                    ShareLink(item: url) {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
            }
        }
        .overlay {
            if viewModel.rows.isEmpty {
                EmptyStateView(
                    title: "Plan de producție gol",
                    systemImage: "cart.badge.plus",
                    subtitle: "Adaugă produsele și cantitățile dorite pentru a calcula necesarul de materii prime."
                )
                .allowsHitTesting(false)
            }
        }
        .sheet(isPresented: $showRecipePicker) {
            NavigationStack {
                RecipePickerView(
                    currentId: "",
                    onSelect: { id, name, unit, yieldQuantity in
                        viewModel.addRecipe(id: id, name: name, unit: unit, yieldQuantity: yieldQuantity)
                        showRecipePicker = false
                    },
                    onCancel: { showRecipePicker = false }
                )
            }
        }
        .errorAlert($viewModel.error)
    }

    // MARK: Plan input

    private var planSection: some View {
        Section {
            ForEach($viewModel.rows) { $row in
                HStack {
                    Text(row.recipeName)
                    Spacer()
                    TextField("0", value: $row.quantity, format: .number)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 70)
                    Text(row.unit.abbreviation)
                        .foregroundStyle(.secondary)
                        .frame(width: 36, alignment: .leading)
                }
            }
            .onDelete { viewModel.rows.remove(atOffsets: $0) }

            Button {
                showRecipePicker = true
            } label: {
                HStack {
                    Image(systemName: "plus")
                        .foregroundStyle(AppTheme.Colors.primary)
                    Text("Adaugă produs")
                        .foregroundStyle(Color.primary)
                }
            }

            if !viewModel.rows.isEmpty {
                Button {
                    Task { await viewModel.compute() }
                } label: {
                    HStack {
                        if viewModel.isComputing {
                            ProgressView().padding(.trailing, 4)
                        }
                        Text("Calculeaza necesarul")
                            .font(.body.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                }
                .disabled(viewModel.isComputing || viewModel.validItems.isEmpty)
            }
        } header: {
            Text("Plan de producție")
        } footer: {
            if !viewModel.rows.isEmpty {
                Text("Cantitățile sunt în unitatea rețetei. Semipreparatele sunt descompuse până la materii prime.")
            }
        }
    }

    // MARK: Results

    private func resultsSection(_ result: RequirementsPlanResult) -> some View {
        Section {
            ForEach(result.requirements) { req in
                RequirementRow(requirement: req)
            }
        } header: {
            HStack {
                Text("Necesar materii prime (\(result.requirements.count))")
                Spacer()
                if viewModel.isExporting {
                    ProgressView()
                } else if viewModel.shareURL == nil {
                    Button {
                        Task { await viewModel.export() }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundStyle(AppTheme.Colors.primary)
                            Text("Export Excel")
                                .foregroundStyle(Color.primary)
                        }
                    }
                    .font(.caption.weight(.semibold))
                    .textCase(nil)
                }
            }
        } footer: {
            Text("După export, folosește butonul de share din dreapta sus pentru a trimite fișierul Excel.")
        }
    }
}

// MARK: - Requirement Row

private struct RequirementRow: View {
    let requirement: PlanRequirement

    private func fmt(_ n: Double) -> String {
        n.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", n)
            : String(format: "%.2f", n)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                Text(requirement.title)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(fmt(requirement.needed)) \(requirement.unit)")
                    .font(.subheadline.weight(.medium))
            }

            HStack(spacing: AppTheme.Spacing.lg) {
                if let supplier = requirement.supplierName {
                    Label(supplier, systemImage: "shippingbox")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text("Stoc: \(fmt(requirement.available)) \(requirement.unit)")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                if requirement.deficit > 0 {
                    Text("De cumparat: \(fmt(requirement.deficit)) \(requirement.unit)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                } else {
                    Text("Stoc suficient")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
