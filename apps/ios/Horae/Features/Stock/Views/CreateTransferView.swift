import SwiftUI
import Observation

// MARK: - Unified source-stock item

/// A single transferable item at a location, regardless of whether it is a raw
/// material (MaterialStock) or a produced recipe (RecipeStock — produse finite /
/// semipreparate). Gives both kinds a stable identity, title, unit, available
/// quantity and category so the picker + form can treat them uniformly.
struct SourceStockItem: Identifiable, Equatable {
    enum Kind: Equatable {
        case rawMaterial
        case recipe
    }

    /// Stable id = the underlying rawMaterialId or recipeId.
    let id: String
    let kind: Kind
    let title: String
    let unit: UnitType
    let quantity: Double
    let category: String?

    static func from(_ s: LocationStockResponse) -> SourceStockItem {
        SourceStockItem(
            id: s.rawMaterialId,
            kind: .rawMaterial,
            title: s.rawMaterialTitle,
            unit: s.unit,
            quantity: s.quantity,
            category: s.category
        )
    }

    static func from(_ s: LocationRecipeStockResponse) -> SourceStockItem {
        // Available = on-hand minus reserved (what's free to transfer).
        SourceStockItem(
            id: s.recipeId,
            kind: .recipe,
            title: s.recipeName,
            unit: s.unit,
            quantity: max(s.quantity - s.reservedCount, 0),
            category: s.category
        )
    }
}

/// Prefill for the transfer form when opened from an item's detail screen
/// (quick action): the item to move and, when unambiguous, its source location.
struct TransferPreselection {
    var rawMaterialId: String?
    var recipeId: String?
    var fromLocationId: String?
}

@Observable
final class CreateTransferViewModel {
    /// Sentinel tag for the "Alta destinatie (eveniment)" picker choice.
    static let adhocTag = "__ADHOC__"

    var locations: [LocationResponse] = []
    var fromLocationId: String?
    var toLocationId: String?
    /// Ad-hoc (one-off / event) destination fields — used when the picker is
    /// on "Alta destinatie (eveniment)" instead of a real location.
    var destinationName = ""
    var destinationAddress = ""
    /// Recipient (person) at the destination — printed on the aviz.
    var destinationContact = ""
    var notes = ""
    var delegateIdCard = ""
    var transportMeans = ""
    var hasDispatchDate = false
    var dispatchedAt = Date()

    var isAdhocDestination: Bool { toLocationId == Self.adhocTag }
    var assignedToId: String?
    var assignedToName: String?
    var showUserPicker = false
    var isLoading = false
    var isSaving = false
    var error: APIError?

    /// One-shot: skip the reset the view does on source-location change when
    /// the change came from applying the preselection (not from the user).
    var skipNextLocationReset = false

    private let preselection: TransferPreselection?
    private var didPreselectItem = false

    init(preselection: TransferPreselection? = nil) {
        self.preselection = preselection
    }

    /// Raw-material stock per location: locationId -> [raw stock].
    var allLocationStock: [String: [LocationStockResponse]] = [:]
    /// Produced-recipe stock per location: locationId -> [recipe stock].
    var allLocationRecipeStock: [String: [LocationRecipeStockResponse]] = [:]

    private let service = LocationService.shared

    // MARK: - Unified source stock

    /// Unified transferable stock at the selected "De la" location (raw + recipe).
    var sourceStock: [SourceStockItem] {
        guard let fromId = fromLocationId else { return [] }
        let raw = (allLocationStock[fromId] ?? []).map(SourceStockItem.from)
        let recipes = (allLocationRecipeStock[fromId] ?? []).map(SourceStockItem.from)
        return raw + recipes
    }

    /// Unified transferable stock at an arbitrary location.
    private func unifiedStock(at locationId: String) -> [SourceStockItem] {
        let raw = (allLocationStock[locationId] ?? []).map(SourceStockItem.from)
        let recipes = (allLocationRecipeStock[locationId] ?? []).map(SourceStockItem.from)
        return raw + recipes
    }

    /// Locations that have ALL currently selected items in stock.
    var availableSourceLocations: [LocationResponse] {
        let selectedIds = Set(addedIds)
        guard !selectedIds.isEmpty else { return locations }
        return locations.filter { loc in
            let stockIds = Set(unifiedStock(at: loc.id).map(\.id))
            return selectedIds.isSubset(of: stockIds)
        }
    }

    func loadAll() async {
        isLoading = true
        defer { isLoading = false }

        do {
            locations = try await service.fetchLocations()
            // Fetch raw + recipe stock for every location in parallel.
            await withTaskGroup(
                of: (String, [LocationStockResponse], [LocationRecipeStockResponse]).self
            ) { group in
                for loc in locations {
                    let locId = loc.id
                    group.addTask { [service] in
                        async let raw = (try? await service.fetchLocationStock(id: locId)) ?? []
                        async let recipes = (try? await service.fetchLocationRecipeStock(id: locId)) ?? []
                        return (locId, await raw, await recipes)
                    }
                }
                for await (locId, raw, recipes) in group {
                    allLocationStock[locId] = raw
                    allLocationRecipeStock[locId] = recipes
                }
            }
            applyPreselection()
            captureSnapshot()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    // MARK: - Preselection (quick action from an item detail view)

    /// Called once, right after locations + stock loaded.
    private func applyPreselection() {
        guard let preselection else {
            // Sursa implicita = locatia implicita a organizatiei (Stoc › Locatii).
            if fromLocationId == nil,
               let configured = BrandingManager.shared.defaultLocationId,
               locations.contains(where: { $0.id == configured }) {
                skipNextLocationReset = true
                fromLocationId = configured
            }
            return
        }
        if let fromId = preselection.fromLocationId,
           fromLocationId == nil,
           locations.contains(where: { $0.id == fromId }) {
            skipNextLocationReset = true
            fromLocationId = fromId
        }
        preselectItemIfNeeded()
    }

    /// Auto-add the preselected item once a source location that stocks it is
    /// selected (either from the preselection or by the user). Fires once.
    func preselectItemIfNeeded() {
        guard !didPreselectItem, let preselection, fromLocationId != nil else { return }
        guard let itemId = preselection.rawMaterialId ?? preselection.recipeId else {
            didPreselectItem = true
            return
        }
        guard let item = sourceItem(itemId), item.quantity > 0 else { return }
        didPreselectItem = true
        addItem(item.id)
    }

    // MARK: - Picked items

    /// Quantity chosen per item at the source location (item id -> qty).
    var quantities: [String: Double] = [:]
    /// Items picked from the dropdown, in the order added (item ids).
    var addedIds: [String] = []

    func addItem(_ id: String) {
        guard !addedIds.contains(id) else { return }
        addedIds.append(id)
        quantities[id] = 0
    }

    func removeItem(_ id: String) {
        addedIds.removeAll { $0 == id }
        quantities[id] = nil
    }

    /// The unified source item for an id (if still present at the source).
    func sourceItem(_ id: String) -> SourceStockItem? {
        sourceStock.first { $0.id == id }
    }

    /// Available quantity of an item at the selected source location.
    func available(_ id: String) -> Double {
        sourceItem(id)?.quantity ?? 0
    }

    func unit(_ id: String) -> UnitType {
        sourceItem(id)?.unit ?? .KILOGRAME
    }

    /// Clear chosen items/quantities (e.g. when the source location changes).
    func resetQuantities() { quantities = [:]; addedIds = [] }

    private var chosen: [(item: SourceStockItem, qty: Double)] {
        addedIds.compactMap { id in
            guard let item = sourceItem(id), let qty = quantities[id], qty > 0 else { return nil }
            return (item, qty)
        }
    }

    // MARK: - Unsaved-changes tracking

    /// Snapshot of the user-editable fields (transient UI/loading state excluded)
    /// used to detect edits.
    private struct Snapshot: Equatable {
        var fromLocationId: String?
        var toLocationId: String?
        var destinationName: String
        var destinationAddress: String
        var destinationContact: String
        var notes: String
        var delegateIdCard: String
        var transportMeans: String
        var hasDispatchDate: Bool
        var assignedToId: String?
        var assignedToName: String?
        var addedIds: [String]
        var quantities: [String: Double]
    }

    private var initialSnapshot: Snapshot?

    private var currentSnapshot: Snapshot {
        Snapshot(
            fromLocationId: fromLocationId,
            toLocationId: toLocationId,
            destinationName: destinationName,
            destinationAddress: destinationAddress,
            destinationContact: destinationContact,
            notes: notes,
            delegateIdCard: delegateIdCard,
            transportMeans: transportMeans,
            hasDispatchDate: hasDispatchDate,
            assignedToId: assignedToId,
            assignedToName: assignedToName,
            addedIds: addedIds,
            quantities: quantities
        )
    }

    private func trimmedOrNil(_ text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    /// Whether the form has unsaved changes relative to its initial snapshot.
    var isDirty: Bool {
        guard let initialSnapshot else { return false }
        return currentSnapshot != initialSnapshot
    }

    /// Capture the baseline for change detection (after preselection is applied).
    func captureSnapshot() {
        initialSnapshot = currentSnapshot
    }

    var canSave: Bool {
        guard let fromId = fromLocationId else { return false }
        if isAdhocDestination {
            guard !destinationName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return false
            }
        } else {
            guard let toId = toLocationId, fromId != toId else { return false }
        }
        let picked = chosen
        return !picked.isEmpty && picked.allSatisfy { $0.qty <= $0.item.quantity }
    }

    func save() async -> TransferResponse? {
        guard let fromId = fromLocationId, toLocationId != nil else { return nil }
        let adhoc = isAdhocDestination
        let name = destinationName.trimmingCharacters(in: .whitespacesAndNewlines)
        let address = destinationAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        let contact = destinationContact.trimmingCharacters(in: .whitespacesAndNewlines)

        isSaving = true
        defer { isSaving = false }

        do {
            let request = CreateTransferRequest(
                fromLocationId: fromId,
                // Exactly one of toLocationId XOR destinationName.
                toLocationId: adhoc ? nil : toLocationId,
                destinationName: adhoc ? name : nil,
                destinationAddress: adhoc && !address.isEmpty ? address : nil,
                destinationContact: contact.isEmpty ? nil : contact,
                notes: notes.isEmpty ? nil : notes,
                assignedToId: assignedToId,
                delegateIdCard: trimmedOrNil(delegateIdCard),
                transportMeans: trimmedOrNil(transportMeans),
                dispatchedAt: hasDispatchDate
                    ? RoDate.calendar.startOfDay(for: dispatchedAt).iso8601String : nil,
                items: chosen.map { picked in
                    switch picked.item.kind {
                    case .rawMaterial:
                        return TransferItemRequest(
                            rawMaterialId: picked.item.id,
                            recipeId: nil,
                            quantity: picked.qty,
                            unit: picked.item.unit
                        )
                    case .recipe:
                        return TransferItemRequest(
                            rawMaterialId: nil,
                            recipeId: picked.item.id,
                            quantity: picked.qty,
                            unit: picked.item.unit
                        )
                    }
                }
            )
            let created = try await service.createTransfer(request)
            // Confirmation: transfer started, where to, how many items.
            await ToastCenter.shared.show(
                "Transferul a fost initiat",
                lines: [
                    "\(created.fromLocation.name) → \(created.toLocation.name)",
                    "\(created.items.count) articole",
                ]
            )
            return created
        } catch let err as APIError {
            error = err
            return nil
        } catch {
            self.error = .networkError(error)
            return nil
        }
    }
}

struct CreateTransferView: View {
    @State private var viewModel: CreateTransferViewModel
    @State private var showItemPicker = false
    @State private var showDiscardConfirm = false
    @Environment(\.dismiss) private var dismiss

    init(preselection: TransferPreselection? = nil) {
        self._viewModel = State(initialValue: CreateTransferViewModel(preselection: preselection))
    }

    var body: some View {
        Form {
            // 1. Source location first
            Section("De la (locație sursă)") {
                StockFlowLayout(spacing: 8) {
                    ForEach(viewModel.locations) { loc in
                        HChip(loc.name, isSelected: viewModel.fromLocationId == loc.id) {
                            viewModel.fromLocationId = loc.id
                        }
                    }
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Locație sursă")
                .onChange(of: viewModel.fromLocationId) {
                    if viewModel.skipNextLocationReset {
                        viewModel.skipNextLocationReset = false
                    } else {
                        viewModel.resetQuantities()
                    }
                    if viewModel.toLocationId == viewModel.fromLocationId { viewModel.toLocationId = nil }
                    viewModel.preselectItemIfNeeded()
                }
            }

            // 2. Pick products (raw + produse) from a dropdown; each gets a slider/input
            if viewModel.fromLocationId != nil {
                Section {
                    if viewModel.sourceStock.allSatisfy({ $0.quantity <= 0 }) {
                        Text("Locația nu are stoc.").foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.addedIds, id: \.self) { id in
                            if let item = viewModel.sourceItem(id) {
                                transferRow(item)
                            }
                        }
                        .onDelete { offsets in
                            for i in offsets { viewModel.removeItem(viewModel.addedIds[i]) }
                        }

                        // Opens a dedicated picker: stock at the source grouped by
                        // category, with available quantities.
                        Button {
                            showItemPicker = true
                        } label: {
                            HStack {
                                Image(systemName: "plus.circle")
                                    .foregroundStyle(AppTheme.Colors.primary)
                                Text("Adaugă produs")
                                    .foregroundStyle(Color.primary)
                            }
                        }
                    }
                } header: {
                    Text("Ce transferi?").tutorialAnchor(id: "stock.transfers.items")
                }
            }

            // 3. Destination + notes
            if viewModel.fromLocationId != nil {
                Section {
                    StockFlowLayout(spacing: 8) {
                        ForEach(viewModel.locations.filter { $0.id != viewModel.fromLocationId }) { loc in
                            HChip(loc.name, isSelected: viewModel.toLocationId == loc.id) {
                                viewModel.toLocationId = loc.id
                            }
                        }
                        HChip(
                            "Altă destinație (eveniment)",
                            isSelected: viewModel.toLocationId == CreateTransferViewModel.adhocTag
                        ) {
                            viewModel.toLocationId = CreateTransferViewModel.adhocTag
                        }
                    }
                    .padding(.vertical, 4)
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Destinație")

                    if viewModel.isAdhocDestination {
                        TextField("Destinație", text: $viewModel.destinationName)
                        TextField("Adresa (opțional)", text: $viewModel.destinationAddress)
                    }
                    TextField("Destinatar (opțional)", text: $viewModel.destinationContact)
                } header: {
                    Text("Către (destinație)")
                } footer: {
                    if viewModel.isAdhocDestination {
                        Text("Destinație unică (ex: eveniment). La finalizare, produsele ies din stoc fără a intra într-o altă locație. Destinatarul apare pe avizul de însoțire.")
                    } else {
                        Text("Destinatarul (persoana care primeste marfa) apare pe avizul de însoțire.")
                    }
                }

                Section {
                    Button {
                        viewModel.showUserPicker = true
                    } label: {
                        HStack {
                            Text(viewModel.assignedToName ?? "Selectează persoana")
                                .foregroundStyle(viewModel.assignedToName != nil ? .primary : .secondary)
                            Spacer()
                            if viewModel.assignedToId != nil {
                                Button {
                                    viewModel.assignedToId = nil
                                    viewModel.assignedToName = nil
                                } label: {
                                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                                }
                                .buttonStyle(.borderless)
                            }
                            Image(systemName: "chevron.right").foregroundStyle(.secondary)
                        }
                    }
                    TextField("CI delegat (opțional) — ex: XZ 123456", text: $viewModel.delegateIdCard)
                        .textInputAutocapitalization(.characters)
                    TextField("Mijloc de transport (opțional) — ex: auto B-01-ABC", text: $viewModel.transportMeans)
                        .textInputAutocapitalization(.characters)
                    Toggle("Data expedierii", isOn: $viewModel.hasDispatchDate)
                    if viewModel.hasDispatchDate {
                        DatePicker("Expediat pe", selection: $viewModel.dispatchedAt, displayedComponents: .date)
                            .environment(\.locale, RoDate.locale)
                    }
                } header: {
                    Text("Transport")
                } footer: {
                    Text("Persoana care duce transferul. Obligatorie pentru a pune transferul în tranzit.")
                }

                Section("Note") {
                    TextField("Note transfer (opțional)", text: $viewModel.notes, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
        }
        .navigationTitle("Transfer nou")
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    if viewModel.isDirty { showDiscardConfirm = true } else { dismiss() }
                } label: {
                    Image(systemName: "xmark")
                }
            }

            ToolbarItem(placement: .confirmationAction) {
                Button("Creaza") {
                    Task {
                        if await viewModel.save() != nil {
                            dismiss()
                        }
                    }
                }
                .disabled(!viewModel.canSave || viewModel.isSaving)
            }
        }
        .task { await viewModel.loadAll() }
        .unsavedChangesGuard(isDirty: viewModel.isDirty, isPresented: $showDiscardConfirm) {
            dismiss()
        }
        .errorAlert($viewModel.error)
        .sheet(isPresented: $viewModel.showUserPicker) {
            NavigationStack {
                UserPickerView(
                    currentId: viewModel.assignedToId ?? "",
                    onSelect: { id, name in
                        viewModel.assignedToId = id
                        viewModel.assignedToName = name
                        viewModel.showUserPicker = false
                    },
                    onCancel: { viewModel.showUserPicker = false }
                )
            }
        }
        .sheet(isPresented: $showItemPicker) {
            NavigationStack {
                TransferItemPickerView(
                    stock: viewModel.sourceStock,
                    addedIds: Set(viewModel.addedIds),
                    onSelect: { id in viewModel.addItem(id) }
                )
            }
        }
    }

    @ViewBuilder
    private func transferRow(_ item: SourceStockItem) -> some View {
        let id = item.id
        let maxQty = item.quantity
        let qty = Binding<Double>(
            get: { viewModel.quantities[id] ?? 0 },
            // clamp to [0, available] AND re-clamp after rounding — rounding up
            // (8.765 → 8.77) must not exceed the available stock, and "Tot"
            // must store exactly maxQty so the pill reads as selected.
            set: {
                let clamped = min(max(0, $0), maxQty)
                viewModel.quantities[id] = min((clamped * 100).rounded() / 100, maxQty)
            }
        )
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                Text(item.title).font(.subheadline.weight(.medium))
                Spacer()
                Text("disp: \(item.unit.formatQty(maxQty))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            // Fara slider — valori preset ca la tips + input liber; cantitatile
            // de transfer sunt numere "rotunde", nu 8.76 tras din drag.
            HStack(spacing: AppTheme.Spacing.sm) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: AppTheme.Spacing.xs) {
                        ForEach([1.0, 3, 5, 10].filter { $0 <= maxQty }, id: \.self) { preset in
                            QtyPresetPill(
                                label: preset.qtyFormatted,
                                isSelected: qty.wrappedValue == preset
                            ) { qty.wrappedValue = preset }
                        }
                        QtyPresetPill(label: "Tot", isSelected: qty.wrappedValue == maxQty && maxQty > 0) {
                            qty.wrappedValue = maxQty
                        }
                    }
                }
                TextField("0", value: qty, format: .number.precision(.fractionLength(0...2)))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 90)
                    .textFieldStyle(.roundedBorder)
                Text(item.unit.abbreviation).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Quantity Preset Pill

/// Pill de cantitate preset (pattern "tips"): valori fixe + "Tot", cu input
/// liber alaturi. Selectat = fundal accent cu text alb; textul neselectat
/// ramane neutru.
private struct QtyPresetPill: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption.weight(isSelected ? .semibold : .regular))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(isSelected ? AppTheme.Colors.primary : Color(.systemGray5))
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Transfer Item Picker

/// Picks products to transfer from the source location's unified stock (raw
/// materials + produse finite + semipreparate), grouped by category, showing the
/// available quantity. Multi-add with a checkmark; the quantity is set afterwards
/// on the transfer form.
struct TransferItemPickerView: View {
    let stock: [SourceStockItem]
    let addedIds: Set<String>
    let onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    @State private var justAdded: Set<String> = []

    private static let miscCategory = StockText.noCategory

    private var filtered: [SourceStockItem] {
        stock.filter { s in
            guard s.quantity > 0 else { return false }
            guard search.isEmpty
                || s.title.localizedCaseInsensitiveContains(search) else { return false }
            return true
        }
    }

    private var grouped: [(category: String, items: [SourceStockItem])] {
        Dictionary(grouping: filtered) { $0.category ?? Self.miscCategory }
            .map { (category: $0.key, items: $0.value.sorted {
                $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
            }) }
            .sorted { $0.category.localizedCaseInsensitiveCompare($1.category) == .orderedAscending }
    }

    var body: some View {
        List {
            if filtered.isEmpty {
                ContentUnavailableView(
                    "Niciun produs",
                    systemImage: "shippingbox",
                    description: Text("Locația sursă nu are stoc disponibil de transferat.")
                )
            } else {
                ForEach(grouped, id: \.category) { group in
                    Section(group.category) {
                        ForEach(group.items) { s in
                            let isAdded = addedIds.contains(s.id) || justAdded.contains(s.id)
                            Button {
                                onSelect(s.id)
                                justAdded.insert(s.id)
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(s.title)
                                            .foregroundStyle(.primary)
                                        if s.kind == .recipe {
                                            Text("Produs")
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                    Text("disp: \(s.unit.formatQty(s.quantity))")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if isAdded {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(AppTheme.Colors.success)
                                    } else {
                                        Image(systemName: "plus.circle")
                                            .foregroundStyle(AppTheme.Colors.primary)
                                    }
                                }
                                // .plain limiteaza tap-ul la continutul vizibil —
                                // fara asta golurile din rand nu raspund la tap.
                                .contentShape(Rectangle())
                            }
                            .disabled(isAdded)
                        }
                    }
                }
            }
        }
        .buttonStyle(.plain) // listele nu tinteaza textul randurilor
        .listStyle(.insetGrouped)
        .searchable(text: $search, prompt: "Caută produs…")
        .navigationTitle("Adaugă produs")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Gata") { dismiss() }
            }
        }
    }
}

#Preview {
    NavigationStack {
        CreateTransferView()
    }
}
