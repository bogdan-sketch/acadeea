import SwiftUI
import Charts

struct RawMaterialDetailView: View {
    let materialId: String
    @State private var material: RawMaterialResponse?
    @State private var priceHistory: [PriceHistoryEntry] = []
    @State private var lots: [StockLotEntry] = []
    @State private var categories: [String] = []
    @State private var editCategory: String?
    @State private var suppliers: [Supplier] = []
    @State private var availability: StockItemAvailability?
    @State private var isLoading = false
    @State private var showEdit = false
    @State private var showBatchReceive = false
    @State private var showTransfer = false
    @State private var showAdjust = false
    @State private var showDeleteConfirm = false
    @State private var showCannotDelete = false
    @State private var deleteInfo: RawMaterialDeleteInfo?
    @State private var isDeleting = false
    @State private var error: APIError?
    @Environment(\.dismiss) private var dismiss

    @State private var showCategorySheet = false
    @State private var showSupplierSheet = false

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }
    private var canUpdate: Bool { permissions.can(.update, .RawMaterial) }

    var body: some View {
        Group {
            if let material {
                materialContent(material)
            } else if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView(
                    "Materia primă nu a fost găsită",
                    systemImage: "exclamationmark.triangle",
                    description: Text("Poate a fost ștearsă. Întoarce-te la Stoc și reîncarcă lista.")
                )
            }
        }
        .appScreenBackground(showsGradient: false)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Nu poate fi ștearsă", isPresented: $showCannotDelete) {
            Button("Am înțeles", role: .cancel) {}
        } message: {
            Text(cannotDeleteMessage)
        }
        .alert("Ștergi definitiv „\(material?.title ?? "materialul")”?", isPresented: $showDeleteConfirm) {
            Button("Anulează", role: .cancel) {}
            Button("Șterge definitiv", role: .destructive) { Task { await delete() } }
        } message: {
            Text(
                "Această acțiune este ireversibilă."
                    + ((deleteInfo?.everUsed ?? false)
                        ? "\n\nAtenție: această materie primă a fost folosită în rețete sau producție — ștergerea elimină definitiv și istoricul de mișcări, loturile și trasabilitatea asociate."
                        : "")
            )
        }
        .sheet(isPresented: $showEdit) {
            if let material {
                NavigationStack {
                    EditRawMaterialFormView(material: material) { updated in
                        self.material = updated
                        self.editCategory = updated.category
                    }
                }
            }
        }
        .sheet(isPresented: $showCategorySheet) {
            StockChipPickerSheet(
                title: "Categorie",
                options: categories.map { StockChoice(id: $0, title: $0) },
                selection: editCategory,
                noneTitle: StockText.noCategory
            ) { setCategory($0) }
        }
        .sheet(isPresented: $showSupplierSheet) {
            StockChipPickerSheet(
                title: "Furnizor",
                options: suppliers.map { StockChoice(id: $0.id, title: $0.name) },
                selection: material?.supplierId,
                noneTitle: "Fără furnizor"
            ) { setSupplier($0) }
        }
        .sheet(isPresented: $showBatchReceive, onDismiss: { Task { await load() } }) {
            NavigationStack {
                BatchReceiveView(preselectedMaterialId: materialId)
            }
            // A sheet is its own presentation host: anchor preferences never
            // reach the AppTabView overlay, so hints inside it need their own.
            .tutorialOverlay()
        }
        .sheet(isPresented: $showTransfer, onDismiss: { Task { await load() } }) {
            NavigationStack {
                CreateTransferView(preselection: transferPreselection)
            }
            .tutorialOverlay()
        }
        .sheet(isPresented: $showAdjust, onDismiss: { Task { await load() } }) {
            if let material {
                NavigationStack {
                    StockMovementFormView(
                        preselectedItem: StockMovementItemPreselection(
                            rawMaterialId: material.id,
                            consumableId: nil,
                            title: material.title,
                            unit: material.unit,
                            currentStock: Double(material.stockCount)
                        ),
                        lockItem: true,
                        initialType: .AJUSTARE
                    )
                }
            }
        }
        .task { await load() }
        .errorAlert($error)
    }

    /// Preselects this material for the transfer form; when exactly one
    /// location holds stock, it becomes the source location too.
    private var transferPreselection: TransferPreselection {
        let stocked = (availability?.locations ?? []).filter { $0.quantity > 0 }
        return TransferPreselection(
            rawMaterialId: materialId,
            recipeId: nil,
            fromLocationId: stocked.count == 1 ? stocked[0].locationId : nil
        )
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let mat = StockService.shared.fetchRawMaterial(id: materialId)
            async let history = StockService.shared.fetchPriceHistory(rawMaterialId: materialId)
            async let intake = StockService.shared.fetchLots(rawMaterialId: materialId)
            async let avail = StockService.shared.fetchItemAvailability(rawMaterialId: materialId)
            material = try await mat
            editCategory = material?.category
            priceHistory = (try? await history) ?? []
            lots = (try? await intake) ?? []
            availability = try? await avail
            categories = (try? await RecipeService.shared.fetchCategories(kind: "MATERIE_PRIMA")) ?? []
            suppliers = (try? await SupplierService.shared.fetchSuppliers()) ?? []
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Blocked-delete explanation: stock still on hand vs a transfer in flight.
    private var cannotDeleteMessage: String {
        let name = material?.title ?? "Materialul"
        if let info = deleteInfo, info.currentStock == 0, (info.activeTransfers ?? 0) > 0 {
            return "\(name) apare pe un transfer în curs (în așteptare sau în tranzit). "
                + "Finalizează sau anulează transferul, apoi încearcă din nou."
        }
        return "\(name) are încă "
            + "\(material.map { $0.unit.formatQty(deleteInfo?.currentStock ?? 0) } ?? (deleteInfo?.currentStock ?? 0).qtyFormatted) în stoc. "
            + "Ștergerea definitivă este posibilă doar când stocul este 0."
    }

    /// Pre-delete check: routes to the "still has stock" warning or the
    /// destructive confirm (with the history/traceability fine print).
    private func prepareDelete() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            let info = try await StockService.shared.fetchRawMaterialDeleteInfo(id: materialId)
            deleteInfo = info
            if info.canDelete {
                showDeleteConfirm = true
            } else {
                showCannotDelete = true
            }
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Hold/release a lot for FIFO. Held lots are consumed last, so
    /// production can be steered onto a different (e.g. newer) lot.
    private func toggleLotHold(_ lot: StockLotEntry) async {
        do {
            let updated = try await StockService.shared.setLotHold(id: lot.id, onHold: !(lot.onHold ?? false))
            if let idx = lots.firstIndex(where: { $0.id == lot.id }) {
                lots[idx] = updated
            }
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    private func delete() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await StockService.shared.hardDeleteRawMaterial(id: materialId)
            dismiss()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    private func setCategory(_ cat: String?) {
        editCategory = cat
        Task {
            do {
                material = try await StockService.shared.updateRawMaterialCategory(id: materialId, category: cat)
            } catch let err as APIError {
                error = err
            } catch {
                self.error = .networkError(error)
            }
        }
    }

    private func setSupplier(_ supplierId: String?) {
        Task {
            do {
                material = try await StockService.shared.updateRawMaterialSupplier(id: materialId, supplierId: supplierId)
            } catch let err as APIError {
                error = err
            } catch {
                self.error = .networkError(error)
            }
        }
    }

    private var canCreateMovement: Bool {
        permissions.can(.create, .StockMovement)
    }

    private var canCreateTransfer: Bool {
        permissions.can(.create, .StockTransfer)
    }

    // MARK: - Content

    private func materialContent(_ m: RawMaterialResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                StockDetailHeader(
                    eyebrow: "Materie primă",
                    title: m.title,
                    status: m.status,
                    category: editCategory,
                    meta: headerMeta(m),
                    onCategoryTap: canUpdate ? { showCategorySheet = true } : nil
                )
                actions
                StockLevelsCard(levels: levels(m))
                if let locations = availability?.locations.filter({ $0.quantity != 0 }), !locations.isEmpty {
                    StockLocationsCard(locations: locations) { m.unit.stockDisplay($0) }
                }
                RawMaterialInfoCard(
                    material: m,
                    onSupplierTap: canUpdate ? { showSupplierSheet = true } : nil
                )
                if BrandingManager.shared.nutritionEnabled {
                    NutritionEditorSection(
                        rawMaterialId: m.id,
                        initial: m.nutrition,
                        initialAllergens: m.allergens,
                        canEdit: canUpdate
                    )
                }
                if !priceHistory.isEmpty {
                    StockPriceHistoryCard(
                        entries: priceHistory,
                        currentPrice: m.purchasePrice?.stockPrice(per: m.unit.priceUnitLabel)
                    )
                }
                lotsSection(m)
                StockTimestampsFooter(createdAt: m.createdAt, updatedAt: m.updatedAt)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 24)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await Task { await load() }.value }
    }

    private func headerMeta(_ m: RawMaterialResponse) -> String {
        [m.supplierName ?? m.producer,
         m.minimumStock > 0 ? "prag minim \(m.unit.stockDisplay(m.minimumStock))" : nil]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// Word buttons like the web: Recepție · Transfer · Ajustare · Editează · Șterge.
    private var actions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if canCreateMovement {
                    HQuickActionChip("Recepție", systemImage: "arrow.down", help: "Înregistrează o intrare pentru acest material") {
                        showBatchReceive = true
                    }
                }
                if canCreateTransfer {
                    HQuickActionChip("Transfer", systemImage: "arrow.left.arrow.right", help: "Mută o cantitate în altă locație") {
                        showTransfer = true
                    }
                }
                if canCreateMovement {
                    HQuickActionChip("Ajustare", systemImage: "slider.horizontal.3", help: "Corectează stocul la valoarea reală") {
                        showAdjust = true
                    }
                }
                if permissions.can(.read, .StockMovement) {
                    HQuickActionChip(
                        "Trasabilitate", systemImage: "point.3.connected.trianglepath.dotted",
                        help: "Toate taskurile care au folosit această materie primă",
                        destination: .productTraceability(
                            kind: .rawMaterial, id: materialId, name: material?.title ?? "Materie primă"))
                }
                if canUpdate {
                    HQuickActionChip("Editează", systemImage: "pencil", help: "Denumire, categorie, furnizor, unitate, stoc minim") {
                        showEdit = true
                    }
                }
                if permissions.can(.delete, .RawMaterial) {
                    HQuickActionChip("Șterge", systemImage: "trash", help: "Șterge definitiv materia primă (doar cu stoc 0)", glyphTone: .danger) {
                        Task { await prepareDelete() }
                    }
                    .disabled(isDeleting)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
        }
        // Bleed to the screen edges so the strip scrolls under the gutter.
        .padding(.horizontal, -16)
    }

    /// "În stoc" always; Disponibil / Rezervat / Deschise / Comandate only
    /// when non-zero. Every figure carries the material's unit.
    private func levels(_ m: RawMaterialResponse) -> [StockLevel] {
        let q = { (v: Double) in m.unit.stockDisplay(v) }
        var list = [StockLevel(
            label: "În stoc", value: q(m.stockCount),
            tone: m.stockCount <= 0 ? .danger : (m.isLowStock ? .warning : nil))]
        if m.reservedCount > 0 {
            list.append(StockLevel(label: "Disponibil", value: q(m.stockCount - m.reservedCount)))
            list.append(StockLevel(label: "Rezervat", value: q(m.reservedCount), tone: .warning))
        }
        if m.openedCount > 0 { list.append(StockLevel(label: "Deschise", value: q(m.openedCount))) }
        if m.orderedCount > 0 { list.append(StockLevel(label: "Comandate", value: q(m.orderedCount))) }
        return list
    }

    @ViewBuilder
    private func lotsSection(_ m: RawMaterialResponse) -> some View {
        HSectionHeader("Istoric intrări (\(lots.count))")
            .padding(.top, 4)
        if lots.isEmpty {
            HCard {
                Text("Nicio intrare înregistrată. Folosește „Recepție” când primești marfă.")
                    .font(AppFont.body(13))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
        } else {
            ForEach(lots) { lot in
                StockLotCard(lot: lot, unit: lot.unit ?? m.unit, canManage: canUpdate) {
                    Task { await toggleLotHold(lot) }
                }
            }
        }
    }
}

// MARK: - Informații

/// Configuration of the material (not live stock): unit, packaging, storage,
/// minimum, loss, supplier chooser, lot/expiry, purchase and invoice.
private struct RawMaterialInfoCard: View {
    let material: RawMaterialResponse
    let onSupplierTap: (() -> Void)?

    var body: some View {
        let m = material
        HCard {
            VStack(alignment: .leading, spacing: 8) {
                StockCardTitle("Informații")
                rows(m)
            }
        }
    }

    @ViewBuilder
    private func rows(_ m: RawMaterialResponse) -> some View {
        StockInfoRow("Furnizor") {
            if let onSupplierTap {
                StockChooserButton(
                    value: m.supplierName ?? "Fără furnizor",
                    isPlaceholder: m.supplierName == nil,
                    label: "Furnizor",
                    action: onSupplierTap
                )
            } else {
                Text(m.supplierName ?? "Fără furnizor")
            }
        }
        if let producer = m.producer, !producer.isEmpty {
            StockDivider()
            StockInfoRow("Producător", producer)
        }
        StockDivider()
        StockInfoRow("Unitate", m.unit.abbreviation)
        if let qpp = m.quantityPerPiece, qpp > 0 {
            StockDivider()
            StockInfoRow("Cantitate pe bucată", m.unit.stockDisplay(qpp))
            if let pieceType = m.pieceType {
                StockDivider()
                StockInfoRow("Tip ambalaj", pieceType.displayName)
            }
        }
        StockDivider()
        StockInfoRow("Tip depozitare", m.storageType.displayName)
        StockDivider()
        StockInfoRow("Stoc minim", m.unit.stockDisplay(m.minimumStock))
        StockDivider()
        StockInfoRow("Pierderi estimate", m.estimatedLossPercent.stockPercent)
        if let lot = m.lotNumber, !lot.isEmpty {
            StockDivider()
            StockInfoRow("Nr. lot", lot)
        }
        if let expiry = m.expiryDate {
            StockDivider()
            StockInfoRow("Expiră") {
                Text(StockDate.full(expiry))
                    .foregroundStyle(expiry < Date() ? AppTheme.Status.fg(.danger) : AppTheme.Colors.label)
            }
        }
        if let price = m.purchasePrice {
            StockDivider()
            StockInfoRow("Preț achiziție", price.stockPrice(per: m.unit.priceUnitLabel))
        }
        if let invoiceNumber = m.invoiceNumber, !invoiceNumber.isEmpty {
            StockDivider()
            StockInfoRow("Nr. factură", invoiceNumber)
        }
        if let invoiceDate = m.invoiceDate {
            StockDivider()
            StockInfoRow("Data facturii", StockDate.full(invoiceDate))
        }
    }
}

#Preview("Materie primă") {
    NavigationStack {
        RawMaterialDetailView(materialId: "preview")
    }
}
