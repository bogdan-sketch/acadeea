import SwiftUI
import Observation

@Observable
final class BatchReceiveViewModel {
    var materials: [RawMaterialResponse] = []
    var items: [BatchReceiveFormItem] = [BatchReceiveFormItem()]
    var availableLocations: [LocationResponse] = []
    var locationId: String?
    /// cu/fara TVA for every price on this receipt.
    var pricesIncludeVat = !BrandingManager.shared.vatPayer
    var isLoading = false
    var isSubmitting = false
    var error: APIError?

    private let stockService = StockService.shared
    private let rawMaterialService = StockService.shared
    private let locationService = LocationService.shared

    /// Material to seed the first row with (quick action from a detail view).
    private let preselectedMaterialId: String?

    init(preselectedMaterialId: String? = nil) {
        self.preselectedMaterialId = preselectedMaterialId
    }

    struct BatchReceiveFormItem: Identifiable {
        let id = UUID()
        var rawMaterialId: String = ""
        var quantity: String = ""
        var unit: UnitType = .KILOGRAME
        var lotNumber: String = ""
        var expiryDate: Date?
        var purchasePrice: String = ""
        var supplierInvoice: String = ""
    }

    /// "= 0,6 kg în stoc" when the row's unit differs from the material's;
    /// a red hint when there is no exact conversion. nil when nothing to say.
    func stockPreview(for item: BatchReceiveFormItem) -> (text: String, ok: Bool)? {
        guard let material = materials.first(where: { $0.id == item.rawMaterialId }),
              item.unit != material.unit,
              let typed = RoFormat.parseDecimal(item.quantity),
              typed > 0
        else { return nil }
        if let converted = item.unit.convert(typed, to: material.unit) {
            return ("= \(material.unit.humanizedString(converted)) în stoc", true)
        }
        return ("\(item.unit.abbreviation) nu se poate converti în \(material.unit.abbreviation) — alege unitatea materialului.", false)
    }

    func loadMaterials() async {
        do {
            let response = try await rawMaterialService.fetchRawMaterials(query: RawMaterialQuery(limit: 200))
            materials = response.data
            // Seed the first (still empty) row with the preselected material,
            // exactly as picking it in the row's picker would. If it isn't in
            // the first page of materials, fetch it by id so the preselect
            // still works (one-shot — only when the row is still empty).
            if let preselectedMaterialId,
               let first = items.first, first.rawMaterialId.isEmpty {
                var material = materials.first(where: { $0.id == preselectedMaterialId })
                if material == nil,
                   let fetched = try? await rawMaterialService.fetchRawMaterial(id: preselectedMaterialId) {
                    materials.append(fetched)
                    material = fetched
                }
                if let material {
                    items[0].rawMaterialId = material.id
                    items[0].unit = material.unit
                }
            }
        } catch {}
    }

    /// Load the locations stock can be received at and prefill with the user's
    /// primary (first) location. Falls back to all active locations when the
    /// user has none assigned.
    func loadLocations() async {
        do {
            var locations = try await locationService.fetchMyLocations()
            if locations.isEmpty {
                locations = try await locationService.fetchLocations().filter { $0.isActive }
            }
            availableLocations = locations
            if locationId == nil, let preferred = locations.preferredDefault {
                locationId = preferred.id
            }
        } catch {}
    }

    func addItem() {
        items.append(BatchReceiveFormItem())
    }

    func removeItem(_ item: BatchReceiveFormItem) {
        items.removeAll { $0.id == item.id }
        if items.isEmpty { items.append(BatchReceiveFormItem()) }
    }

    func submit() async -> Bool {
        isSubmitting = true
        defer { isSubmitting = false }

        let batchItems = items.compactMap { item -> BatchReceiveItem? in
            // RO keyboards type decimals with a comma ("1,5", "1.250,5").
            guard !item.rawMaterialId.isEmpty, let typed = RoFormat.parseDecimal(item.quantity), typed > 0
            else { return nil }
            // Send what was shown under the field: the quantity in the
            // material's own unit (explicit conversion, no server guessing).
            let stockUnit = materials.first { $0.id == item.rawMaterialId }?.unit ?? item.unit
            let converted = item.unit.convert(typed, to: stockUnit)
            let qty = converted ?? typed
            let unit = converted == nil ? item.unit : stockUnit

            let formatter = ISO8601DateFormatter()
            return BatchReceiveItem(
                rawMaterialId: item.rawMaterialId,
                quantity: qty,
                unit: unit,
                lotNumber: item.lotNumber.isEmpty ? nil : item.lotNumber,
                expiryDate: item.expiryDate.map { formatter.string(from: $0) },
                purchasePrice: RoFormat.parseDecimal(item.purchasePrice),
                priceIncludesVat: item.purchasePrice.isEmpty ? nil : pricesIncludeVat,
                supplierInvoice: item.supplierInvoice.isEmpty ? nil : item.supplierInvoice
            )
        }

        guard !batchItems.isEmpty else {
            error = .unknown("Adaugă cel puțin un material valid")
            return false
        }

        do {
            _ = try await stockService.batchReceive(BatchReceiveRequest(items: batchItems, locationId: locationId))
            // Confirmation summary: where the goods landed and what came in.
            let locationName = availableLocations.first { $0.id == locationId }?.name
            let lines = batchItems.map { item -> String in
                let title = materials.first { $0.id == item.rawMaterialId }?.title ?? "Material"
                return "\(item.unit.formatQty(item.quantity)) \(title)"
            }
            await ToastCenter.shared.show(
                "Recepție făcută",
                lines: (locationName.map { [$0] } ?? []) + lines
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

struct BatchReceiveView: View {
    @State private var viewModel: BatchReceiveViewModel
    @State private var createForRow: Int?
    @Environment(\.dismiss) private var dismiss

    /// Material of a row ("" = none); picking one also takes its unit.
    private func materialBinding(_ index: Int) -> Binding<String?> {
        Binding(
            get: {
                let id = viewModel.items[index].rawMaterialId
                return id.isEmpty ? nil : id
            },
            set: { id in
                viewModel.items[index].rawMaterialId = id ?? ""
                if let unit = viewModel.materials.first(where: { $0.id == id })?.unit {
                    viewModel.items[index].unit = unit
                }
            }
        )
    }

    init(preselectedMaterialId: String? = nil) {
        self._viewModel = State(initialValue: BatchReceiveViewModel(preselectedMaterialId: preselectedMaterialId))
    }

    var body: some View {
            Form {
                if !viewModel.availableLocations.isEmpty {
                    Section("Locație") {
                        StockFlowLayout(spacing: 8) {
                            ForEach(viewModel.availableLocations) { loc in
                                HChip(loc.name, isSelected: viewModel.locationId == loc.id) {
                                    viewModel.locationId = loc.id
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section {
                    Toggle(
                        "Prețurile includ TVA (\(Int(BrandingManager.shared.vatRatePercent))%)",
                        isOn: $viewModel.pricesIncludeVat
                    )
                } footer: {
                    Text(BrandingManager.shared.vatPayer
                        ? "Prețurile se rețin fără TVA (plătitor de TVA) — conversia se face automat."
                        : "Prețurile se rețin cu TVA (neplătitor) — conversia se face automat.")
                }

                ForEach(Array(viewModel.items.enumerated()), id: \.element.id) { index, item in
                    Section("Material #\(index + 1)") {
                        StockChooserRow(
                            label: "Material",
                            options: viewModel.materials.map { StockChoice(id: $0.id, title: $0.title) },
                            selection: materialBinding(index),
                            placeholder: "Alege materialul"
                        )
                        .tutorialAnchor(id: "stock.receive.addRow")

                        // Create a never-before-seen product without leaving the receipt.
                        Button {
                            createForRow = index
                        } label: {
                            HStack {
                                Image(systemName: "plus.app")
                                    .foregroundStyle(AppTheme.Colors.primary)
                                Text("Produs nou")
                                    .foregroundStyle(Color.primary)
                            }
                                .font(.subheadline)
                        }

                        TextField("Cantitate", text: $viewModel.items[index].quantity)
                            .keyboardType(.decimalPad)

                        UnitSelector(unit: $viewModel.items[index].unit, title: "Unitate")

                        // Stock, lot and journal stay in the material's unit:
                        // a quantity typed in another unit is shown converted
                        // BEFORE saving (600 g → "= 0,6 kg în stoc").
                        if let line = viewModel.stockPreview(for: viewModel.items[index]) {
                            Text(line.text)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(line.ok ? Color.primary : Color.red)
                        }

                        TextField("Nr. lot (opțional)", text: $viewModel.items[index].lotNumber)

                        if viewModel.items[index].expiryDate == nil {
                            Button {
                                viewModel.items[index].expiryDate = Calendar.current.date(byAdding: .month, value: 6, to: Date())
                            } label: {
                                HStack {
                                    Image(systemName: "calendar.badge.plus")
                                        .foregroundStyle(AppTheme.Colors.primary)
                                    Text("Adaugă data expirării")
                                        .foregroundStyle(Color.primary)
                                }
                            }
                        } else {
                            DatePicker("Expiră la", selection: Binding(
                                get: { viewModel.items[index].expiryDate ?? Date() },
                                set: { viewModel.items[index].expiryDate = $0 }
                            ), displayedComponents: .date)
                        }

                        TextField("Preț achiziție RON/\(viewModel.items[index].unit.priceUnitLabel) (opțional)", text: $viewModel.items[index].purchasePrice)
                            .keyboardType(.decimalPad)

                        TextField("Factură furnizor (opțional)", text: $viewModel.items[index].supplierInvoice)

                        if viewModel.items.count > 1 {
                            Button("Șterge", role: .destructive) {
                                viewModel.removeItem(item)
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
                            Text("Adaugă material")
                                .foregroundStyle(Color.primary)
                        }
                    }
                }
            }
            .navigationTitle("Recepție batch")
            .navigationBarBackButtonHidden()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            if await viewModel.submit() { dismiss() }
                        }
                    } label: {
                        Image(systemName: "checkmark")
                    }
                    .disabled(viewModel.isSubmitting)
                }
            }
            .task {
                await viewModel.loadMaterials()
                await viewModel.loadLocations()
            }
            .errorAlert($viewModel.error)
            .sheet(isPresented: Binding(
                get: { createForRow != nil },
                set: { if !$0 { createForRow = nil } }
            )) {
                NavigationStack {
                    QuickCreateRawMaterialView { material in
                        viewModel.materials.append(material)
                        if let row = createForRow, viewModel.items.indices.contains(row) {
                            viewModel.items[row].rawMaterialId = material.id
                            viewModel.items[row].unit = material.unit
                        }
                        createForRow = nil
                    }
                }
            }
    }
}

// MARK: - Quick Create (inline during a receipt)

/// Minimal raw-material create used inside the receipt flow so a stock manager
/// can add a never-before-seen product without interrupting the reception.
struct QuickCreateRawMaterialView: View {
    let onCreated: (RawMaterialResponse) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var unit: UnitType = .KILOGRAME
    @State private var storageType: StorageType = .WARM
    @State private var category = ""
    @State private var minimumStock = ""
    @State private var isSaving = false
    @State private var error: APIError?

    private let service = StockService.shared

    var body: some View {
        Form {
            Section("Produs nou") {
                TextField("Denumire", text: $title)
                UnitSelector(unit: $unit, title: "Unitate")
                Picker("Depozitare", selection: $storageType) {
                    ForEach(StorageType.allCases, id: \.self) { s in
                        Text(s.displayName).tag(s)
                    }
                }
                .pickerStyle(.segmented)
                TextField("Categorie (opțional)", text: $category)
                TextField("Stoc minim (opțional)", text: $minimumStock)
                    .keyboardType(.numberPad)
            }
        }
        .navigationTitle("Produs nou")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Image(systemName: "xmark") }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task { await create() }
                } label: {
                    if isSaving { ProgressView() } else { Text("Creează") }
                }
                .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
            }
        }
        .errorAlert($error)
    }

    private func create() async {
        isSaving = true
        defer { isSaving = false }

        let body = CreateRawMaterialRequest(
            title: title.trimmingCharacters(in: .whitespaces),
            category: category.isEmpty ? nil : category,
            lotNumber: nil,
            expiryDate: nil,
            producer: nil,
            supplierId: nil,
            locationId: nil,
            unit: unit,
            quantityPerPiece: nil,
            pieceType: nil,
            storageType: storageType,
            minimumStock: RoFormat.parseDecimal(minimumStock),
            estimatedLossPercent: nil,
            purchasePrice: nil,
            invoiceNumber: nil,
            invoiceDate: nil
        )

        do {
            let material = try await service.createRawMaterial(body)
            onCreated(material)
            dismiss()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

#Preview {
    BatchReceiveView()
}
