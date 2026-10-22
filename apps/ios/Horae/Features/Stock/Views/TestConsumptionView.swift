import SwiftUI
import Observation

/// "Consum teste" — scoate din stoc materii prime / consumabile folosite la
/// teste si R&D. Efectul pe stoc e identic cu un consum de productie
/// (per-locatie, FIFO pe loturi), dar fara task si fara produs finit.
@Observable
final class TestConsumptionViewModel {
    struct FormItem: Identifiable {
        let id = UUID()
        var rawMaterialId: String?
        var consumableId: String?
        var name: String?
        /// Text, ca sa accepte virgula de pe tastatura romaneasca.
        var quantity: String = ""
        var unit: UnitType = .KILOGRAME

        var parsedQuantity: Double? {
            RoFormat.parseDecimal(quantity)
        }

        var isValid: Bool {
            (rawMaterialId != nil || consumableId != nil) && (parsedQuantity ?? 0) > 0
        }
    }

    var availableLocations: [LocationResponse] = []
    var locationId: String?
    var items: [FormItem] = [FormItem()]
    var notes = ""
    var isSubmitting = false
    var error: APIError?

    private let stockService = StockService.shared
    private let locationService = LocationService.shared

    var selectedLocationName: String? {
        availableLocations.first { $0.id == locationId }?.name
    }

    var isFormValid: Bool {
        locationId != nil && items.contains(where: \.isValid)
    }

    /// Locatiile la care userul poate lucra, cu locatia lui principala
    /// preselectata. Cade pe toate locatiile active daca nu are niciuna.
    func loadLocations() async {
        do {
            var locations = try await locationService.fetchMyLocations()
            if locations.isEmpty {
                locations = try await locationService.fetchLocations().filter { $0.isActive }
            }
            availableLocations = locations
            if locationId == nil {
                locationId = locations.preferredDefault?.id
            }
        } catch {}
    }

    func addItem() {
        items.append(FormItem())
    }

    func removeItem(id: UUID) {
        items.removeAll { $0.id == id }
        if items.isEmpty { items.append(FormItem()) }
    }

    func selectRawMaterial(row: Int, id: String, title: String, unit: UnitType) {
        guard items.indices.contains(row) else { return }
        items[row].rawMaterialId = id
        items[row].consumableId = nil
        items[row].name = title
        items[row].unit = unit
    }

    func selectConsumable(row: Int, id: String, title: String) {
        guard items.indices.contains(row) else { return }
        items[row].consumableId = id
        items[row].rawMaterialId = nil
        items[row].name = title
        items[row].unit = .BUCATI
    }

    func submit() async -> Bool {
        guard let locationId else { return false }

        isSubmitting = true
        defer { isSubmitting = false }

        let payload = items.compactMap { item -> TestConsumptionItem? in
            guard item.isValid, let qty = item.parsedQuantity else { return nil }
            return TestConsumptionItem(
                rawMaterialId: item.rawMaterialId,
                consumableId: item.consumableId,
                quantity: qty,
                unit: item.unit
            )
        }

        guard !payload.isEmpty else {
            error = .unknown("Adaugă cel puțin un articol cu cantitate")
            return false
        }

        let note = notes.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            _ = try await stockService.testConsumption(
                TestConsumptionRequest(
                    locationId: locationId,
                    items: payload,
                    notes: note.isEmpty ? nil : note
                )
            )
            // Rezumat: de unde s-a scos si ce anume.
            let lines = items.filter(\.isValid).map { item in
                "\(item.unit.formatQty(item.parsedQuantity ?? 0)) \(item.name ?? "articol")"
            }
            await ToastCenter.shared.show(
                "Consum teste înregistrat",
                lines: (selectedLocationName.map { [$0] } ?? []) + lines
            )
            return true
        } catch let err as APIError {
            error = err
            return false
        } catch {
            self.error = .networkError(error)
            return false
        }
    }
}

struct TestConsumptionView: View {
    @State private var viewModel = TestConsumptionViewModel()
    /// Randul al carui picker de articol e deschis (nil = inchis).
    @State private var pickerRow: Int?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                StockFlowLayout(spacing: 8) {
                    ForEach(viewModel.availableLocations) { loc in
                        HChip(loc.name, isSelected: viewModel.locationId == loc.id) {
                            viewModel.locationId = loc.id
                        }
                    }
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Locație de unde se consumă")
            } header: {
                Text("Locație")
            } footer: {
                Text("Stocul se scade din această locație, FIFO pe loturi — la fel ca la producție.")
            }

            ForEach(Array(viewModel.items.enumerated()), id: \.element.id) { index, item in
                Section("Articol #\(index + 1)") {
                    Button {
                        pickerRow = index
                    } label: {
                        HStack {
                            Text(item.name ?? "Selectează articol")
                                .foregroundStyle(item.name != nil ? Color.primary : .secondary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .tutorialAnchor(id: "stock.testConsumption.rows")

                    TextField("Cantitate", text: $viewModel.items[index].quantity)
                        .keyboardType(.decimalPad)
                        .accessibilityLabel("Cantitate articol \(index + 1)")

                    // Prefill-uita din unitatea de stoc a articolului la selectie.
                    UnitSelector(unit: $viewModel.items[index].unit, title: "Unitate")

                    if viewModel.items.count > 1 {
                        Button("Șterge", role: .destructive) {
                            viewModel.removeItem(id: item.id)
                        }
                    }
                }
            }

            Section {
                Button {
                    viewModel.addItem()
                } label: {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                            .foregroundStyle(AppTheme.Colors.primary)
                        Text("Adaugă articol")
                            .foregroundStyle(Color.primary)
                    }
                    .contentShape(Rectangle())
                }
            }

            Section {
                TextField("Notă (opțional) — ex. teste rețetă nouă", text: $viewModel.notes, axis: .vertical)
                    .lineLimit(1...3)
            } footer: {
                Text("Nota apare pe fiecare mișcare de stoc generată.")
            }
        }
        .navigationTitle("Consum teste")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Image(systemName: "xmark") }
                    .accessibilityLabel("Renunță")
            }
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task {
                        if await viewModel.submit() { dismiss() }
                    }
                } label: {
                    Image(systemName: "checkmark")
                }
                .disabled(!viewModel.isFormValid || viewModel.isSubmitting)
                .accessibilityLabel("Înregistrează consumul")
            }
        }
        .overlay {
            if viewModel.isSubmitting {
                ProgressView("Se salvează…")
            }
        }
        .task { await viewModel.loadLocations() }
        .errorAlert($viewModel.error)
        .sheet(isPresented: Binding(
            get: { pickerRow != nil },
            set: { if !$0 { pickerRow = nil } }
        )) {
            NavigationStack {
                StockItemPickerView(
                    onSelectRawMaterial: { id, title, unit, _ in
                        if let row = pickerRow {
                            viewModel.selectRawMaterial(row: row, id: id, title: title, unit: unit)
                        }
                        pickerRow = nil
                    },
                    onSelectConsumable: { id, title, _ in
                        if let row = pickerRow {
                            viewModel.selectConsumable(row: row, id: id, title: title)
                        }
                        pickerRow = nil
                    },
                    onCancel: { pickerRow = nil },
                    // Doar ce chiar exista la locatia aleasa — un consum de test
                    // dîntr-o altă locatie nu are sens.
                    restrictToLocationId: viewModel.locationId
                )
            }
        }
    }
}

#Preview {
    NavigationStack {
        TestConsumptionView()
    }
}
