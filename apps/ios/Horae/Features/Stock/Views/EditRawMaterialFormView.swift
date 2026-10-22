import SwiftUI

/// Full admin edit of an existing raw material.
struct EditRawMaterialFormView: View {
    let material: RawMaterialResponse
    let onSave: (RawMaterialResponse) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var producer: String
    @State private var unit: UnitType
    @State private var storageType: StorageType
    @State private var lotNumber: String
    @State private var hasExpiry: Bool
    @State private var expiryDate: Date
    @State private var purchasePrice: Double
    /// cu/fara TVA for a re-typed price (payer default: fara TVA).
    @State private var priceIncludesVat: Bool
    @State private var minimumStock: Double
    @State private var estimatedLossPercent: Double
    @State private var category: String?
    @State private var supplierId: String?
    @State private var status: MaterialStatus
    @State private var invoiceNumber: String
    @State private var hasInvoiceDate: Bool
    @State private var invoiceDate: Date
    @State private var categories: [String] = []
    @State private var suppliers: [Supplier] = []
    @State private var locations: [LocationResponse] = []
    @State private var locationId: String?
    @State private var isSaving = false
    @State private var error: APIError?
    @State private var showDiscardConfirm = false

    /// Baseline field values captured at init, for unsaved-changes detection.
    private let initial: FieldsSnapshot

    struct FieldsSnapshot: Equatable {
        var title: String
        var producer: String
        var unit: UnitType
        var storageType: StorageType
        var lotNumber: String
        var hasExpiry: Bool
        var expiryDate: Date
        var purchasePrice: Double
        var priceIncludesVat: Bool
        var minimumStock: Double
        var estimatedLossPercent: Double
        var locationId: String?
        var category: String?
        var supplierId: String?
        var status: MaterialStatus
        var invoiceNumber: String
        var hasInvoiceDate: Bool
        var invoiceDate: Date
    }

    init(material: RawMaterialResponse, onSave: @escaping (RawMaterialResponse) -> Void) {
        self.material = material
        self.onSave = onSave
        // Build the baseline once, then seed both @State and the snapshot from it
        // so a non-deterministic default (expiryDate = now) matches exactly.
        let snapshot = FieldsSnapshot(
            title: material.title,
            producer: material.producer ?? "",
            unit: material.unit,
            storageType: material.storageType,
            lotNumber: material.lotNumber ?? "",
            hasExpiry: material.expiryDate != nil,
            expiryDate: material.expiryDate ?? Date(),
            purchasePrice: material.purchasePrice ?? 0,
            priceIncludesVat: !BrandingManager.shared.vatPayer,
            minimumStock: material.minimumStock,
            estimatedLossPercent: material.estimatedLossPercent,
            locationId: nil,
            category: material.category,
            supplierId: material.supplierId,
            status: material.status,
            invoiceNumber: material.invoiceNumber ?? "",
            hasInvoiceDate: material.invoiceDate != nil,
            invoiceDate: material.invoiceDate ?? Date()
        )
        self.initial = snapshot
        _category = State(initialValue: snapshot.category)
        _supplierId = State(initialValue: snapshot.supplierId)
        _status = State(initialValue: snapshot.status)
        _invoiceNumber = State(initialValue: snapshot.invoiceNumber)
        _hasInvoiceDate = State(initialValue: snapshot.hasInvoiceDate)
        _invoiceDate = State(initialValue: snapshot.invoiceDate)
        _title = State(initialValue: snapshot.title)
        _producer = State(initialValue: snapshot.producer)
        _unit = State(initialValue: snapshot.unit)
        _storageType = State(initialValue: snapshot.storageType)
        _lotNumber = State(initialValue: snapshot.lotNumber)
        _hasExpiry = State(initialValue: snapshot.hasExpiry)
        _expiryDate = State(initialValue: snapshot.expiryDate)
        _purchasePrice = State(initialValue: snapshot.purchasePrice)
        _priceIncludesVat = State(initialValue: snapshot.priceIncludesVat)
        _minimumStock = State(initialValue: snapshot.minimumStock)
        _estimatedLossPercent = State(initialValue: snapshot.estimatedLossPercent)
    }

    private var current: FieldsSnapshot {
        FieldsSnapshot(
            title: title,
            producer: producer,
            unit: unit,
            storageType: storageType,
            lotNumber: lotNumber,
            hasExpiry: hasExpiry,
            expiryDate: expiryDate,
            purchasePrice: purchasePrice,
            priceIncludesVat: priceIncludesVat,
            minimumStock: minimumStock,
            estimatedLossPercent: estimatedLossPercent,
            locationId: locationId,
            category: category,
            supplierId: supplierId,
            status: status,
            invoiceNumber: invoiceNumber,
            hasInvoiceDate: hasInvoiceDate,
            invoiceDate: invoiceDate
        )
    }

    private var isDirty: Bool { current != initial }

    private var isValid: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        Form {
            Section("Informații") {
                FormField(label: "Denumire", isRequired: true) {
                    TextField("ex: Făină albă 000", text: $title)
                }
                FormField(label: "Categorie") {
                    StockChooserField(
                        title: "Categorie",
                        options: categories.map { StockChoice(id: $0, title: $0) },
                        selection: $category,
                        noneTitle: StockText.noCategory
                    )
                }
                FormField(label: "Furnizor") {
                    StockChooserField(
                        title: "Furnizor",
                        options: suppliers.map { StockChoice(id: $0.id, title: $0.name) },
                        selection: $supplierId,
                        noneTitle: "Fără furnizor"
                    )
                }
                FormField(label: "Producător") {
                    ProducerField(producer: $producer)
                }
                FormField(label: "Status") {
                    StockChipChoice(
                        options: MaterialStatus.allCases.map { StockChoice(id: $0, title: $0.displayName) },
                        selection: $status
                    )
                }
                FormField(label: "Unitate de măsură") {
                    UnitSelector(unit: $unit)
                }
                // The server rescales stock, lots and the journal on a unit
                // change — say exactly what the stock becomes before saving.
                if unit != material.unit, material.stockCount != 0 {
                    if let converted = material.unit.convert(material.stockCount, to: unit) {
                        Text("Stocul, loturile și jurnalul se convertesc: \(material.unit.humanizedString(material.stockCount)) = \(unit.humanizedString(converted))")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Nu există o conversie exactă între aceste unități — schimbarea e posibilă doar cu stocul la 0.")
                            .font(.footnote)
                            .foregroundStyle(Color.red)
                    }
                }
            }

            Section("Stocare") {
                FormField(label: "Depozitare") {
                    Picker("Stocare", selection: $storageType) {
                        ForEach(StorageType.allCases) { st in Text(st.displayName).tag(st) }
                    }
                    .pickerStyle(.segmented)
                }
                FormField(label: "Stoc minim dorit") {
                    QuantityField(title: "ex: 5", value: $minimumStock)
                }
                FormField(label: "Pierderi estimate (%)") {
                    TextField("ex: 5", value: $estimatedLossPercent, format: .number).keyboardType(.decimalPad)
                }
            }

            if !locations.isEmpty {
                Section {
                    FormField(label: "Asignează la locație") {
                        StockFlowLayout(spacing: 8) {
                            HChip("Nu schimba", isSelected: locationId == nil) { locationId = nil }
                            ForEach(locations) { loc in
                                HChip(loc.name, isSelected: locationId == loc.id) { locationId = loc.id }
                            }
                        }
                    }
                } footer: {
                    Text("Adaugă produsul într-o locație (creează o intrare de stoc acolo).")
                }
            }

            Section("Lot & expirare") {
                FormField(label: "Nr. lot") { TextField("ex: L-2024-77", text: $lotNumber) }
                Toggle("Are data de expirare", isOn: $hasExpiry)
                if hasExpiry {
                    DatePicker("Data expirării", selection: $expiryDate, displayedComponents: .date)
                        .environment(\.locale, RoDate.locale)
                }
            }

            Section("Achiziție") {
                FormField(label: "Preț de achiziție (RON/\(unit.priceUnitLabel))") {
                    TextField("ex: 12,50", value: $purchasePrice, format: .number).keyboardType(.decimalPad)
                }
                Toggle("Prețul include TVA (\(Int(BrandingManager.shared.vatRatePercent))%)", isOn: $priceIncludesVat)
                FormField(label: "Nr. factură") {
                    TextField("ex: FAC-2026-001", text: $invoiceNumber)
                }
                Toggle("Are data facturii", isOn: $hasInvoiceDate)
                if hasInvoiceDate {
                    DatePicker("Data facturii", selection: $invoiceDate, displayedComponents: .date)
                        .environment(\.locale, RoDate.locale)
                }
            }
        }
        .navigationTitle("Editează materie primă")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button { Task { await save() } } label: { Image(systemName: "checkmark") }
                    .disabled(!isValid || isSaving)
            }
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    if isDirty { showDiscardConfirm = true } else { dismiss() }
                } label: {
                    Image(systemName: "xmark")
                }
            }
        }
        .overlay { if isSaving { ProgressView("Se salvează…") } }
        .task {
            async let locs = LocationService.shared.fetchLocations()
            async let sups = SupplierService.shared.fetchSuppliers()
            async let cats = RecipeService.shared.fetchCategories(kind: "MATERIE_PRIMA")
            locations = (try? await locs) ?? []
            suppliers = (try? await sups) ?? []
            categories = (try? await cats) ?? []
        }
        .unsavedChangesGuard(isDirty: isDirty, isPresented: $showDiscardConfirm) {
            dismiss()
        }
        .errorAlert($error)
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let isoDay: (Date) -> String = { RoDate.isoDay($0) }
        let trimmedInvoice = invoiceNumber.trimmingCharacters(in: .whitespaces)
        var body = UpdateRawMaterialRequest(
            title: title.trimmingCharacters(in: .whitespaces),
            producer: producer.isEmpty ? nil : producer.trimmingCharacters(in: .whitespaces),
            unit: unit,
            storageType: storageType,
            minimumStock: minimumStock,
            estimatedLossPercent: estimatedLossPercent,
            purchasePrice: purchasePrice > 0 ? purchasePrice : nil,
            priceIncludesVat: purchasePrice > 0 ? priceIncludesVat : nil,
            lotNumber: lotNumber.isEmpty ? nil : lotNumber.trimmingCharacters(in: .whitespaces),
            expiryDate: hasExpiry ? isoDay(expiryDate) : nil,
            locationId: locationId
        )
        // Only changed relational fields go out, so an untouched form never
        // rewrites category/supplier/status.
        if category != initial.category {
            if let category { body.category = category } else { body.clearCategory = true }
        }
        if supplierId != initial.supplierId {
            if let supplierId { body.supplierId = supplierId } else { body.clearSupplier = true }
        }
        if status != initial.status { body.status = status }
        if trimmedInvoice != initial.invoiceNumber { body.invoiceNumber = trimmedInvoice }
        if hasInvoiceDate {
            body.invoiceDate = isoDay(invoiceDate)
        } else if initial.hasInvoiceDate {
            body.clearInvoiceDate = true
        }
        do {
            let updated = try await StockService.shared.updateRawMaterial(id: material.id, body)
            onSave(updated)
            dismiss()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
