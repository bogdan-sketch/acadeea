import SwiftUI

/// Prefilled, optionally locked item for the movement form when it is opened
/// as a quick action from an item detail screen.
struct StockMovementItemPreselection {
    var rawMaterialId: String?
    var consumableId: String?
    let title: String
    let unit: UnitType
    /// Global stock — the AJUSTARE baseline until per-location availability loads.
    let currentStock: Double
}

struct StockMovementFormView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var movementType: StockMovementType
    @State private var quantity: Double
    @State private var unit: UnitType
    @State private var referenceNote = ""
    @State private var isSaving = false
    @State private var error: APIError?

    // Intake (INTRARE) details for a raw material — recorded in the intake history.
    @State private var lotNumber = ""
    @State private var supplier = ""
    /// Lista de furnizori pentru dropdown (API-ul primeste NUMELE, nu id-ul).
    @State private var supplierOptions: [Supplier] = []
    /// "Alt furnizor..." — receptie de la un furnizor neinregistrat inca.
    @State private var useCustomSupplier = false
    @State private var purchasePrice: Double = 0
    @State private var supplierInvoice = ""
    @State private var barcode = ""
    /// cu/fara TVA — defaults to the org's natural invoice form (payer → fara TVA).
    @State private var priceIncludesVat = !BrandingManager.shared.vatPayer
    @State private var hasExpiry = false
    @State private var expiryDate = Date()

    // Item selection
    @State private var selectedRawMaterialId: String?
    @State private var selectedRawMaterialName: String?
    @State private var selectedConsumableId: String?
    @State private var selectedConsumableName: String?
    @State private var currentStock: Double = 0
    @State private var showItemPicker = false

    // Location — stock is per-location, so a movement must say which one.
    @State private var availableLocations: [LocationResponse] = []
    @State private var locationId: String?

    // Per-location stock + reservations of the selected item.
    @State private var availability: StockItemAvailability?

    /// Last quantity set programmatically by a prefill. When the user types a
    /// different value, prefills stop touching the quantity — a location change,
    /// availability load or item re-pick must never overwrite a typed quantity.
    @State private var lastPrefillQuantity: Double?

    // Reservation warning before an AJUSTARE that drops below what's reserved.
    @State private var showReservationWarning = false
    @State private var reservationWarningMessage = ""

    /// When opened as a quick action for a specific item, the picker is locked.
    private let lockItem: Bool

    init(
        preselectedItem: StockMovementItemPreselection? = nil,
        lockItem: Bool = false,
        initialType: StockMovementType = .INTRARE
    ) {
        self.lockItem = lockItem && preselectedItem != nil
        self._movementType = State(initialValue: initialType)
        self._unit = State(initialValue: preselectedItem?.unit ?? .BUCATI)
        if let item = preselectedItem {
            self._selectedRawMaterialId = State(initialValue: item.rawMaterialId)
            self._selectedRawMaterialName = State(initialValue: item.rawMaterialId != nil ? item.title : nil)
            self._selectedConsumableId = State(initialValue: item.consumableId)
            self._selectedConsumableName = State(initialValue: item.consumableId != nil ? item.title : nil)
            self._currentStock = State(initialValue: item.currentStock)
            let prefill = initialType == .AJUSTARE ? item.currentStock : 0
            self._quantity = State(initialValue: prefill)
            self._lastPrefillQuantity = State(initialValue: prefill)
        } else {
            self._quantity = State(initialValue: 0)
            self._lastPrefillQuantity = State(initialValue: 0)
        }
    }

    private var isFormValid: Bool {
        // AJUSTARE is absolute — 0 is a valid target ("Adu stocul la 0").
        (quantity > 0 || (movementType == .AJUSTARE && quantity >= 0))
            && (selectedRawMaterialId != nil || selectedConsumableId != nil)
    }

    var body: some View {
        Form {
            Section("Tip mișcare") {
                Picker("Tip", selection: $movementType) {
                    ForEach(StockMovementType.manualTypes) { type in
                        Text(type.displayName).tag(type)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: movementType) { applyPrefill() }
            }

            if !availableLocations.isEmpty {
                Section("Locație") {
                    StockFlowLayout(spacing: 8) {
                        ForEach(availableLocations) { loc in
                            HChip(loc.name, isSelected: locationId == loc.id) {
                                locationId = loc.id
                                applyPrefill()
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Section("Articol") {
                if lockItem {
                    HStack {
                        Text(selectedItemName ?? "Articol")
                        Spacer()
                        Image(systemName: "lock.fill")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Button {
                        showItemPicker = true
                    } label: {
                        HStack {
                            Text(selectedItemName ?? "Selectează articol")
                                .foregroundStyle(selectedItemName != nil ? .primary : .secondary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Cantitate") {
                HStack {
                    TextField("Cantitate", value: $quantity, format: .number)
                        .keyboardType(.decimalPad)
                    // Unit is fixed to the selected item's unit — not editable here.
                    Text(unit.abbreviation)
                        .foregroundStyle(.secondary)
                        .frame(width: 50, alignment: .trailing)
                }
                if movementType == .AJUSTARE {
                    Button(role: .destructive) {
                        quantity = 0
                    } label: {
                        Label("Adu stocul la 0", systemImage: "arrow.down.to.line")
                    }
                    .disabled(isSaving)
                }
            }

            Section("Referință") {
                TextField(
                    movementType == .AJUSTARE
                        ? "Notiță (opțional) — apare în istoricul de mișcări"
                        : "ex: Factură #1234",
                    text: $referenceNote
                )
            }

            // Intake details only make sense for receiving a raw material.
            if movementType == .INTRARE && selectedRawMaterialId != nil {
                Section {
                    if supplierOptions.isEmpty || useCustomSupplier {
                        // Freetext: organizatia nu are furnizori definiti SAU
                        // marfa vine de la un furnizor nou ("Alt furnizor…").
                        TextField("Furnizor (ex: Metro)", text: $supplier)
                    } else {
                        StockChooserRow(
                            label: "Furnizor",
                            options: supplierOptions.map { StockChoice(id: $0.name, title: $0.name) }
                                + [StockChoice(id: Self.otherSupplierKey, title: "Alt furnizor…")],
                            selection: supplierSelection,
                            noneTitle: "Fără furnizor"
                        )
                    }
                    TextField("Nr. lot (ex: L-2024-77)", text: $lotNumber)
                    TextField("Nr. factură furnizor (opțional)", text: $supplierInvoice)
                    TextField("Cod de bare (opțional)", text: $barcode)
                        .keyboardType(.asciiCapable)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    HStack {
                        Text("Preț achiziție")
                        Spacer()
                        TextField("0.00", value: $purchasePrice, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 90)
                        Text("RON/\(unit.priceUnitLabel)").foregroundStyle(.secondary)
                    }
                    Toggle("Prețul include TVA (\(Int(BrandingManager.shared.vatRatePercent))%)", isOn: $priceIncludesVat)
                    Toggle("Are data de expirare", isOn: $hasExpiry)
                    if hasExpiry {
                        DatePicker("Data expirare", selection: $expiryDate, displayedComponents: .date)
                    }
                } header: {
                    Text("Detalii intrare")
                } footer: {
                    Text("Se salvează în istoricul de intrări al materiei prime. Prețul actualizează graficul de evoluție.")
                }
            }
        }
        .navigationTitle("Mișcare stoc")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task { await confirmAndSave() }
                } label: {
                    Image(systemName: "checkmark")
                }
                .disabled(!isFormValid || isSaving)
            }
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Image(systemName: "xmark") }
            }
        }
        .overlay {
            if isSaving { ProgressView("Se salvează…") }
        }
        .alert("Atenție — stoc rezervat", isPresented: $showReservationWarning) {
            Button("Nu", role: .cancel) {}
            Button("Da, continuă", role: .destructive) {
                Task { await save() }
            }
        } message: {
            Text(reservationWarningMessage)
        }
        .sheet(isPresented: $showItemPicker) {
            NavigationStack {
                StockItemPickerView(
                    onSelectRawMaterial: { id, name, materialUnit, stock in
                        selectedRawMaterialId = id
                        selectedRawMaterialName = name
                        selectedConsumableId = nil
                        selectedConsumableName = nil
                        unit = materialUnit
                        currentStock = stock
                        applyPrefill()
                        showItemPicker = false
                        Task { await loadAvailability() }
                    },
                    onSelectConsumable: { id, name, stock in
                        selectedConsumableId = id
                        selectedConsumableName = name
                        selectedRawMaterialId = nil
                        selectedRawMaterialName = nil
                        unit = .BUCATI
                        currentStock = stock
                        applyPrefill()
                        showItemPicker = false
                        Task { await loadAvailability() }
                    },
                    onCancel: { showItemPicker = false },
                    // AJUSTARE corrects a physical count at one location — only
                    // show what's actually stocked there. INTRARE can introduce
                    // any item at any location, so it stays global.
                    restrictToLocationId: movementType == .AJUSTARE ? locationId : nil
                )
            }
        }
        .task {
            await loadLocations()
            await loadAvailability()
            // Best-effort — fara furnizori configurati, campul cade pe freetext.
            supplierOptions = (try? await SupplierService.shared.fetchSuppliers()) ?? []
        }
        .errorAlert($error)
    }

    private static let otherSupplierKey = "__other__"

    /// Supplier chooser binding: the API takes the NAME; "Alt furnizor…"
    /// switches to a free-text field (supplier not registered yet).
    private var supplierSelection: Binding<String?> {
        Binding(
            get: { supplier.isEmpty ? nil : supplier },
            set: { value in
                if value == Self.otherSupplierKey {
                    supplier = ""
                    useCustomSupplier = true
                } else {
                    supplier = value ?? ""
                }
            }
        )
    }

    private var selectedItemName: String? {
        selectedRawMaterialName ?? selectedConsumableName
    }

    /// Load the locations the user can move stock at and prefill with their
    /// primary (first) location. Falls back to all active locations when the
    /// user has none assigned.
    private func loadLocations() async {
        do {
            var locations = try await LocationService.shared.fetchMyLocations()
            if locations.isEmpty {
                locations = try await LocationService.shared.fetchLocations().filter { $0.isActive }
            }
            availableLocations = locations
            if locationId == nil, let preferred = locations.preferredDefault {
                locationId = preferred.id
            }
        } catch {}
    }

    /// Per-location stock + reservations of the selected item (raw materials
    /// carry locations; consumables come back global). Best-effort — a failure
    /// just leaves the global stockCount as the AJUSTARE baseline.
    private func loadAvailability() async {
        availability = nil
        do {
            if let rawMaterialId = selectedRawMaterialId {
                availability = try await StockService.shared.fetchItemAvailability(rawMaterialId: rawMaterialId)
            } else if let consumableId = selectedConsumableId {
                availability = try await StockService.shared.fetchItemAvailability(consumableId: consumableId)
            } else {
                return
            }
            applyPrefill()
        } catch {}
    }

    /// The stock the AJUSTARE targets: the selected location's quantity for a
    /// raw material (per-location absolute), the global count for a consumable.
    /// Falls back to the global stockCount when availability isn't loaded.
    private var adjustBaseline: Double {
        if selectedRawMaterialId != nil, let availability, let locationId {
            return availability.locations.first { $0.locationId == locationId }?.quantity ?? 0
        }
        return currentStock
    }

    /// What's reserved in the AJUSTARE scope (per-location for raw materials).
    private var reservedInScope: Double {
        guard let availability else { return 0 }
        if selectedRawMaterialId != nil, let locationId,
           let location = availability.locations.first(where: { $0.locationId == locationId }) {
            return location.reservedCount
        }
        return availability.reservedForTasks
    }

    /// AJUSTARE sets an absolute value — prefill it with the current stock so the
    /// user edits from the real quantity. INTRARE starts empty (a fresh intake).
    /// A quantity the user typed themselves (different from the last prefill) is
    /// never overwritten — only the baseline shifts with location/availability.
    private func applyPrefill() {
        guard selectedRawMaterialId != nil || selectedConsumableId != nil else { return }
        let userTyped = lastPrefillQuantity.map { quantity != $0 } ?? (quantity != 0)
        guard !userTyped else { return }
        let prefill = movementType == .AJUSTARE ? adjustBaseline : 0
        quantity = prefill
        lastPrefillQuantity = prefill
    }

    /// An AJUSTARE that zeroes the stock (or drops below what tasks reserve)
    /// first checks reservations/pending transfers and asks for confirmation.
    private func confirmAndSave() async {
        guard movementType == .AJUSTARE, quantity == 0 || quantity < reservedInScope else {
            await save()
            return
        }

        var fresh: StockItemAvailability?
        do {
            if let rawMaterialId = selectedRawMaterialId {
                fresh = try await StockService.shared.fetchItemAvailability(rawMaterialId: rawMaterialId)
            } else if let consumableId = selectedConsumableId {
                fresh = try await StockService.shared.fetchItemAvailability(consumableId: consumableId)
            }
        } catch {}

        if let fresh {
            availability = fresh
            if fresh.hasReservations {
                var parts: [String] = []
                if fresh.reservedForTasks > 0 {
                    parts.append("Rezervat pentru \(fresh.activeTaskCount) sarcini în lucru: \(fresh.reservedForTasks.qtyFormatted)")
                }
                if !fresh.pendingTransfers.isEmpty {
                    parts.append("Transferuri în curs: \(fresh.pendingTransfers.count)")
                }
                reservationWarningMessage = parts.joined(separator: "\n") + "\n\nContinui cu ajustarea?"
                showReservationWarning = true
                return
            }
        }
        await save()
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        let isIntake = movementType == .INTRARE && selectedRawMaterialId != nil
        let isoDay: (Date) -> String = { date in
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd"
            return f.string(from: date)
        }

        let body = CreateStockMovementRequest(
            rawMaterialId: selectedRawMaterialId,
            consumableId: selectedConsumableId,
            movementType: movementType,
            quantity: quantity,
            unit: unit,
            referenceNote: referenceNote.isEmpty ? nil : referenceNote,
            lotNumber: isIntake && !lotNumber.isEmpty ? lotNumber : nil,
            expiryDate: isIntake && hasExpiry ? isoDay(expiryDate) : nil,
            purchasePrice: isIntake && purchasePrice > 0 ? purchasePrice : nil,
            priceIncludesVat: isIntake && purchasePrice > 0 ? priceIncludesVat : nil,
            supplier: isIntake && !supplier.isEmpty ? supplier : nil,
            locationId: locationId,
            barcode: isIntake && !barcode.trimmingCharacters(in: .whitespaces).isEmpty
                ? barcode.trimmingCharacters(in: .whitespaces) : nil,
            supplierInvoice: isIntake && !supplierInvoice.trimmingCharacters(in: .whitespaces).isEmpty
                ? supplierInvoice.trimmingCharacters(in: .whitespaces) : nil
        )

        do {
            _ = try await StockService.shared.createMovement(body)
            // Confirmation summary of what just happened to the stock.
            let itemName = selectedItemName ?? "articol"
            let qtyText = "\(unit.formatQty(quantity))"
            if movementType == .AJUSTARE {
                await ToastCenter.shared.show(
                    quantity == 0
                        ? "Stocul la \(itemName) a fost redus la 0"
                        : "Stoc ajustat: \(itemName)",
                    lines: quantity == 0 ? [] : ["Stoc nou: \(qtyText)"]
                )
            } else {
                await ToastCenter.shared.show(
                    "Recepție făcută",
                    lines: ["\(qtyText) \(itemName)"]
                )
            }
            dismiss()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

// MARK: - Combined item picker (raw materials + consumables) filtered by category

struct StockItemPickerView: View {
    let onSelectRawMaterial: (String, String, UnitType, Double) -> Void
    let onSelectConsumable: (String, String, Double) -> Void
    let onCancel: () -> Void
    /// When set, only raw materials that actually have stock at this location
    /// are listed (with their per-location quantity) — used for AJUSTARE, where
    /// picking an item from another location makes no sense. nil = global list.
    var restrictToLocationId: String? = nil

    @State private var searchText = ""
    @State private var rawMaterials: [RawMaterialResponse] = []
    @State private var consumables: [ConsumableResponse] = []
    /// Per-location raw stock when `restrictToLocationId` is set.
    @State private var locationStock: [LocationStockResponse] = []
    @State private var categories: [String] = []
    @State private var selectedCategory: String? // nil = Toate
    @State private var isLoading = false
    @State private var showCreateRaw = false
    @State private var showCreateConsumable = false

    private static let miscKey = "__misc__"

    var body: some View {
        List {
            if !categories.isEmpty {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: AppTheme.Spacing.xs) {
                            // Fara "Toate" — tap pe chip-ul activ il scoate.
                            ForEach(categories, id: \.self) { categoryChip($0, $0) }
                            categoryChip(Self.miscKey, StockText.noCategory)
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
                }
            }
            rawMaterialRows
            consumableRows
        }
        .buttonStyle(.plain) // listele nu tinteaza textul randurilor
        .overlay { pickerOverlay }
        .navigationTitle("Selectează articol")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .searchable(text: $searchText, prompt: "Caută…")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: { Image(systemName: "xmark") }
            }
            ToolbarItem(placement: .primaryAction) {
                // Native menu: the bubble opens from the + itself (iPhone + iPad).
                Menu {
                    Button("Materie primă", systemImage: "leaf") { showCreateRaw = true }
                    Button("Consumabil", systemImage: "shippingbox") { showCreateConsumable = true }
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Articol nou")
                .help("Adaugă o materie primă sau un consumabil nou")
            }
        }
        .task { await load() }
        .onChange(of: searchText) { Task { await load() } }
        .sheet(isPresented: $showCreateRaw) {
            NavigationStack {
                CreateRawMaterialFormView(
                    initialCategory: createCategoryDefault,
                    onCreate: { material in
                        onSelectRawMaterial(material.id, material.title, material.unit, Double(material.stockCount))
                    },
                    onCancel: { showCreateRaw = false }
                )
            }
        }
        .sheet(isPresented: $showCreateConsumable) {
            NavigationStack {
                CreateConsumableFormView(
                    initialCategory: createCategoryDefault,
                    onCreate: { consumable in
                        onSelectConsumable(consumable.id, consumable.title, Double(consumable.stockCount))
                    },
                    onCancel: { showCreateConsumable = false }
                )
            }
        }
    }

    @ViewBuilder
    private var rawMaterialRows: some View {
        if restrictToLocationId != nil {
            // Location-scoped: rows come from that location's stock only.
            ForEach(filteredLocationStock) { row in
                Button {
                    onSelectRawMaterial(row.rawMaterialId, row.rawMaterialTitle, row.unit, row.quantity)
                } label: {
                    HStack {
                        Text(row.rawMaterialTitle).font(.body).foregroundStyle(Color.primary)
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            stockText(
                                "\(row.unit.formatQty(row.quantity))",
                                low: row.quantity <= 0
                            )
                            kindTag("M. Prime")
                        }
                    }
                    // .plain pe List limiteaza tap-ul la continutul desenat.
                    .contentShape(Rectangle())
                }
            }
        } else {
            ForEach(filteredRawMaterials) { material in
                Button {
                    onSelectRawMaterial(material.id, material.title, material.unit, Double(material.stockCount))
                } label: {
                    HStack {
                        RawMaterialPickerItemRow(material: material)
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            stockText("\(material.unit.formatQty(material.stockCount))", low: material.stockCount <= 0)
                            kindTag("M. Prime")
                        }
                    }
                    .contentShape(Rectangle())
                }
            }
        }
    }

    @ViewBuilder
    private var consumableRows: some View {
        ForEach(filteredConsumables) { consumable in
            Button {
                onSelectConsumable(consumable.id, consumable.title, Double(consumable.stockCount))
            } label: {
                HStack {
                    Text(consumable.title).font(.body).foregroundStyle(Color.primary)
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        stockText("\(consumable.stockCount.qtyFormatted) buc", low: consumable.stockCount <= 0)
                        kindTag("Consumabil")
                    }
                }
                .contentShape(Rectangle())
            }
        }
    }

    /// On-stock quantity shown on the right of each picker row.
    private func stockText(_ text: String, low: Bool) -> some View {
        Text(text)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(low ? .red : .primary)
    }

    private var createCategoryDefault: String? {
        guard let selectedCategory, selectedCategory != Self.miscKey else { return nil }
        return selectedCategory
    }

    private func matchesCategory(_ category: String?) -> Bool {
        guard let selectedCategory else { return true }
        if selectedCategory == Self.miscKey { return (category ?? "").isEmpty }
        return category == selectedCategory
    }

    private var filteredRawMaterials: [RawMaterialResponse] {
        rawMaterials.filter { matchesCategory($0.category) }
    }

    /// Location-scoped raw rows, filtered by category + search text.
    private var filteredLocationStock: [LocationStockResponse] {
        locationStock.filter { row in
            matchesCategory(row.category)
                && (searchText.isEmpty
                    || row.rawMaterialTitle.localizedCaseInsensitiveContains(searchText))
        }
    }

    private var filteredConsumables: [ConsumableResponse] {
        consumables.filter { matchesCategory($0.category) }
    }

    private func categoryChip(_ value: String?, _ label: String) -> some View {
        let selected = selectedCategory == value
        return Button {
            selectedCategory = selectedCategory == value ? nil : value
        } label: {
            Text(label)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selected ? Color.accentColor : Color(.secondarySystemFill))
                .foregroundStyle(selected ? .white : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func kindTag(_ text: String) -> some View {
        Text(text)
            .font(.caption2)
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(Color(.systemGray6))
            .foregroundStyle(.secondary)
            .clipShape(Capsule())
    }

    @ViewBuilder
    private var pickerOverlay: some View {
        let rawEmpty = restrictToLocationId != nil ? filteredLocationStock.isEmpty : filteredRawMaterials.isEmpty
        if isLoading && rawMaterials.isEmpty && consumables.isEmpty && locationStock.isEmpty {
            ProgressView()
        } else if !isLoading && rawEmpty && filteredConsumables.isEmpty {
            EmptyStateView(
                title: searchText.isEmpty
                    ? (restrictToLocationId != nil ? "Niciun articol pe această locație" : "Niciun articol")
                    : "Niciun rezultat",
                systemImage: "shippingbox"
            )
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        if categories.isEmpty {
            categories = (try? await RecipeService.shared.fetchCategories(kind: "MATERIE_PRIMA")) ?? []
        }
        // Location-scoped (AJUSTARE): raw rows come from that location's stock;
        // consumables stay global (they have no location dimension).
        if let restrictToLocationId {
            async let loc = LocationService.shared.fetchLocationStock(id: restrictToLocationId)
            async let cons = StockService.shared.fetchConsumables(
                query: { var q = ConsumableQuery(); q.search = searchText.isEmpty ? nil : searchText; return q }()
            )
            locationStock = (try? await loc) ?? []
            consumables = (try? await cons)?.data ?? []
            return
        }
        async let raw = StockService.shared.fetchRawMaterials(
            query: { var q = RawMaterialQuery(); q.search = searchText.isEmpty ? nil : searchText; return q }()
        )
        async let cons = StockService.shared.fetchConsumables(
            query: { var q = ConsumableQuery(); q.search = searchText.isEmpty ? nil : searchText; return q }()
        )
        rawMaterials = (try? await raw)?.data ?? []
        consumables = (try? await cons)?.data ?? []
    }
}

private struct RawMaterialPickerItemRow: View {
    let material: RawMaterialResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(material.title).font(.body).foregroundStyle(Color.primary)
            HStack(spacing: AppTheme.Spacing.sm) {
                if let producer = material.producer {
                    Text(producer).font(.caption).foregroundStyle(.secondary)
                }
                Text(material.pieceType.map { "\(material.unit.abbreviation) / \($0.displayName)" } ?? material.unit.abbreviation)
                    .font(.caption).foregroundStyle(.secondary)
                Text(material.storageType.displayName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(Color(.systemGray5))
                    .clipShape(Capsule())
            }
        }
    }
}

// MARK: - Create Raw Material Form

struct CreateRawMaterialFormView: View {
    var initialCategory: String?
    let onCreate: (RawMaterialResponse) -> Void
    let onCancel: () -> Void

    @State private var title = ""
    @State private var category: String?
    @State private var categories: [String] = []
    @State private var producer = ""
    @State private var suppliers: [Supplier] = []
    @State private var supplierId: String?
    @State private var locations: [LocationResponse] = []
    @State private var locationId: String?
    @State private var unit: UnitType = .KILOGRAME
    @State private var storageType: StorageType = .WARM
    @State private var minimumStock: Double = 0
    @State private var estimatedLossPercent: Double = 0
    @State private var isSaving = false
    @State private var error: APIError?

    // Only the name is required.
    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        Form {
            Section("Informații") {
                FormField(label: "Denumire", isRequired: true) {
                    TextField("ex: Făină albă 000", text: $title)
                }
                FormField(label: "Categorie") {
                    categoryPicker($category, categories: categories)
                }
                FormField(label: "Distribuitor") {
                    ProducerField(producer: $producer)
                }
                if !suppliers.isEmpty {
                    FormField(label: "Furnizor") {
                        StockChooserField(
                            title: "Furnizor",
                            options: suppliers.map { StockChoice(id: $0.id, title: $0.name) },
                            selection: $supplierId,
                            noneTitle: "Fără furnizor"
                        )
                    }
                }
                if !locations.isEmpty {
                    FormField(label: "Locație") {
                        StockFlowLayout(spacing: 8) {
                            HChip("Fără locație", isSelected: locationId == nil) { locationId = nil }
                            ForEach(locations) { loc in
                                HChip(loc.name, isSelected: locationId == loc.id) { locationId = loc.id }
                            }
                        }
                    }
                }
                FormField(label: "Unitate de măsură") {
                    UnitSelector(unit: $unit)
                }
                .tutorialAnchor(id: "stock.rawMaterial.create.unit")
            }

            Section("Stocare") {
                FormField(label: "Depozitare") {
                    Picker("Stocare", selection: $storageType) {
                        ForEach(StorageType.allCases) { st in
                            Text(st.displayName).tag(st)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                FormField(label: "Stoc minim dorit (alertă low stock)") {
                    TextField("ex: 5", value: $minimumStock, format: .number)
                        .keyboardType(.numberPad)
                }
                FormField(label: "Pierderi estimate (%)", help: "Procent estimat de pierderi/risipă.") {
                    TextField("ex: 5", value: $estimatedLossPercent, format: .number)
                        .keyboardType(.decimalPad)
                }
            }
        }
        .navigationTitle("Materie primă nouă")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button { Task { await save() } } label: { Image(systemName: "checkmark") }
                    .disabled(!isValid || isSaving)
            }
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: { Image(systemName: "xmark") }
            }
        }
        .overlay {
            if isSaving { ProgressView("Se salvează…") }
        }
        .task {
            category = initialCategory
            categories = (try? await RecipeService.shared.fetchCategories(kind: "MATERIE_PRIMA")) ?? []
            suppliers = (try? await SupplierService.shared.fetchSuppliers()) ?? []
            locations = (try? await LocationService.shared.fetchLocations()) ?? []
        }
        .errorAlert($error)
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        // Lot/expirare + achizitie se completeaza la receptia MP, nu la definirea articolului.
        let body = CreateRawMaterialRequest(
            title: title.trimmingCharacters(in: .whitespaces),
            category: category,
            lotNumber: nil,
            expiryDate: nil,
            producer: producer.isEmpty ? nil : producer.trimmingCharacters(in: .whitespaces),
            supplierId: supplierId,
            locationId: locationId,
            unit: unit,
            quantityPerPiece: nil,
            pieceType: nil,
            storageType: storageType,
            minimumStock: minimumStock > 0 ? minimumStock : nil,
            estimatedLossPercent: estimatedLossPercent > 0 ? estimatedLossPercent : nil,
            purchasePrice: nil,
            invoiceNumber: nil,
            invoiceDate: nil
        )

        do {
            let created = try await StockService.shared.createRawMaterial(body)
            onCreate(created)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

// MARK: - Create Consumable Form

struct CreateConsumableFormView: View {
    var initialCategory: String?
    let onCreate: (ConsumableResponse) -> Void
    let onCancel: () -> Void

    @State private var title = ""
    @State private var category: String?
    @State private var categories: [String] = []
    @State private var minimumStock: Double = 0
    @State private var isSaving = false
    @State private var error: APIError?

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        Form {
            Section("Informații") {
                FormField(label: "Titlu", isRequired: true) {
                    TextField("ex: Cutie tort 30cm", text: $title)
                }
                FormField(label: "Categorie") {
                    categoryPicker($category, categories: categories)
                }
                FormField(label: "Stoc minim (alertă)") {
                    TextField("ex: 10", value: $minimumStock, format: .number)
                        .keyboardType(.numberPad)
                }
            }
        }
        .task {
            category = initialCategory
            categories = (try? await RecipeService.shared.fetchCategories(kind: "MATERIE_PRIMA")) ?? []
        }
        .navigationTitle("Consumabil nou")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button { Task { await save() } } label: { Image(systemName: "checkmark") }
                    .disabled(!isValid || isSaving)
            }
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: { Image(systemName: "xmark") }
            }
        }
        .overlay {
            if isSaving { ProgressView("Se salvează…") }
        }
        .errorAlert($error)
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        let body = CreateConsumableRequest(
            title: title.trimmingCharacters(in: .whitespaces),
            category: category,
            minimumStock: minimumStock > 0 ? minimumStock : nil
        )

        do {
            let created = try await StockService.shared.createConsumable(body)
            onCreate(created)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

/// Shared category chooser for item create forms (none = "Fără categorie").
private func categoryPicker(_ selection: Binding<String?>, categories: [String]) -> some View {
    StockChooserField(
        title: "Categorie",
        options: categories.map { StockChoice(id: $0, title: $0) },
        selection: selection,
        noneTitle: StockText.noCategory
    )
}
