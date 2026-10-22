import SwiftUI
import Observation

@Observable
final class RecipeStockDetailViewModel {
    var recipe: RecipeStockResponse?
    var movements: [StockMovementResponse] = []
    var categories: [String] = []
    var recipeCost: RecipeCostResponse?
    var availability: StockItemAvailability?
    var isLoading = false
    var isSaving = false
    var error: APIError?

    // Loturi de productie — incarcate lenes, la deschiderea sectiunii.
    var lots: [RecipeLotResponse] = []
    var lotsLoaded = false
    var isLoadingLots = false

    // Editable fields
    var editedSellingPrice: String = ""
    var adjustmentQuantity: Int = 1
    var adjustmentNote: String = ""

    // Reservation warning before an adjust that zeroes the stock.
    var showReservationWarning = false
    var reservationWarningMessage = ""
    var pendingAdjustment: (type: StockMovementType, quantity: Double)?

    private let recipeId: String
    private let stockService = StockService.shared
    private let recipeService = RecipeService.shared

    init(recipeId: String) {
        self.recipeId = recipeId
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            async let recipeResult = stockService.fetchRecipeStock(query: {
                var q = RecipeStockQuery()
                q.search = nil
                return q
            }())
            async let movementResult = stockService.fetchMovements(query: {
                var q = StockMovementQuery()
                q.recipeId = recipeId
                return q
            }())
            async let categoriesResult = recipeService.fetchCategories()
            async let costResult = recipeService.fetchRecipeCost(id: recipeId)

            let recipes = try await recipeResult
            recipe = recipes.data.first(where: { $0.id == recipeId })
            movements = try await movementResult.data
            categories = try await categoriesResult

            // Cost fetch may fail (no ingredients, etc.) — non-fatal
            recipeCost = try? await costResult

            // Reservations + per-location stock — non-fatal, best-effort.
            availability = try? await stockService.fetchItemAvailability(recipeId: recipeId)

            // Init editable fields from loaded data
            if let price = recipe?.sellingPrice {
                editedSellingPrice = String(format: "%.2f", price)
            }
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Loturile cu stoc ramas, in ordine FIFO. Best-effort: un esec lasa lista
    /// goala (starea de "fara loturi"), niciodata nu blocheaza fisa.
    func loadLots(force: Bool = false) async {
        guard force || !lotsLoaded else { return }
        isLoadingLots = true
        defer { isLoadingLots = false }
        lots = (try? await stockService.fetchRecipeLots(recipeId: recipeId)) ?? []
        lotsLoaded = true
    }

    func updateCategory(to category: String) async {
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await recipeService.updateRecipePartial(id: recipeId, UpdateRecipeRequest(category: category))
            await load()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func updateSellingPrice() async {
        guard let value = RoFormat.parseDecimal(editedSellingPrice) else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await recipeService.updateRecipePartial(id: recipeId, UpdateRecipeRequest(sellingPrice: value))
            await load()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Entry point for all adjust buttons. An AJUSTARE that zeroes the stock
    /// first checks reservations/pending transfers and asks for confirmation.
    func requestAdjust(type: StockMovementType, quantity: Double) async {
        if type == .AJUSTARE, quantity == 0 {
            let fresh = try? await stockService.fetchItemAvailability(recipeId: recipeId)
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
                    pendingAdjustment = (type, quantity)
                    showReservationWarning = true
                    return
                }
            }
        }
        await adjustStock(type: type, quantity: quantity)
    }

    /// "Da, continua" on the reservation warning.
    func confirmPendingAdjustment() async {
        guard let pending = pendingAdjustment else { return }
        pendingAdjustment = nil
        await adjustStock(type: pending.type, quantity: pending.quantity)
    }

    func adjustStock(type: StockMovementType, quantity: Double) async {
        guard let recipe else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            let note = adjustmentNote.trimmingCharacters(in: .whitespacesAndNewlines)
            let request = CreateRecipeMovementRequest(
                recipeId: recipeId,
                movementType: type,
                quantity: quantity,
                unit: recipe.unit,
                referenceNote: note.isEmpty ? nil : note
            )
            _ = try await stockService.createRecipeMovement(request)
            adjustmentNote = ""
            // Confirmation of the stock effect.
            let name = recipe.name
            let qtyText = "\(recipe.unit.formatQty(quantity))"
            if type == .AJUSTARE {
                await ToastCenter.shared.show(
                    quantity == 0
                        ? "Stocul la \(name) a fost redus la 0"
                        : "Stoc ajustat: \(name)",
                    lines: quantity == 0 ? [] : ["Stoc nou: \(qtyText)"]
                )
            } else {
                await ToastCenter.shared.show("Intrare în stoc: \(name)", lines: ["+\(qtyText)"])
            }
            await load()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

struct RecipeStockDetailView: View {
    let recipeId: String
    @State private var viewModel: RecipeStockDetailViewModel
    @State private var showSetStockAlert = false
    @State private var showTransfer = false
    @State private var absoluteStockText = ""
    @State private var selectedCategory: String = ""
    @State private var lotsExpanded = false

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }
    private var canTransfer: Bool { permissions.can(.create, .StockTransfer) }
    private var canDeductSales: Bool {
        SalesDeductionFeature.shared.isAvailable(permissions) && permissions.can(.create, .StockMovement)
    }
    @Environment(\.routeNavigator) private var navigator

    init(recipeId: String) {
        self.recipeId = recipeId
        self._viewModel = State(initialValue: RecipeStockDetailViewModel(recipeId: recipeId))
    }

    var body: some View {
        Group {
            if let recipe = viewModel.recipe {
                List {
                    if canTransfer || canDeductSales {
                        StockQuickActionsSection {
                            if canTransfer {
                                StockQuickActionButton(label: "Transfer", icon: "arrow.left.arrow.right.circle.fill") {
                                    showTransfer = true
                                }
                            }
                            // Vanzari → stoc (web: "Scade vânzări" pe stocul de produse).
                            if canDeductSales {
                                StockQuickActionButton(label: "Scade vânzări", icon: "receipt") {
                                    navigator.push(.salesDeductions)
                                }
                            }
                        }
                    }
                    infoSection(recipe)
                    pricingSection(recipe)
                    stockSection(recipe)
                    lotsSection(recipe)
                    if BrandingManager.shared.nutritionEnabled {
                        RecipeNutritionSection(recipeId: recipeId)
                    }
                    movementsSection
                }
            } else if viewModel.isLoading {
                ProgressView()
            } else {
                EmptyStateView(title: "Negasit", systemImage: "exclamationmark.triangle")
            }
        }
        .navigationTitle(viewModel.recipe?.name ?? "Detalii stoc")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .task { await SalesDeductionFeature.shared.refresh() }
        .errorAlert($viewModel.error)
        .alert("Seteaza stoc", isPresented: $showSetStockAlert) {
            TextField("Cantitate", text: $absoluteStockText)
                .keyboardType(.decimalPad)
            Button("Seteaza") {
                if let val = RoFormat.parseDecimal(absoluteStockText) {
                    Task { await viewModel.requestAdjust(type: .AJUSTARE, quantity: val) }
                }
            }
            Button("Anulează", role: .cancel) {}
        } message: {
            Text("Introdu valoarea absoluta a stocului")
        }
        .alert("Atenție — stoc rezervat", isPresented: $viewModel.showReservationWarning) {
            Button("Nu", role: .cancel) { viewModel.pendingAdjustment = nil }
            Button("Da, continuă", role: .destructive) {
                Task { await viewModel.confirmPendingAdjustment() }
            }
        } message: {
            Text(viewModel.reservationWarningMessage)
        }
        .sheet(isPresented: $showTransfer, onDismiss: { Task { await viewModel.load() } }) {
            NavigationStack {
                CreateTransferView(preselection: transferPreselection)
            }
            // A sheet is its own presentation host: anchor preferences never
            // reach the AppTabView overlay, so hints inside it need their own.
            .tutorialOverlay()
        }
    }

    /// Preselects this recipe for the transfer form; when exactly one location
    /// holds stock, it becomes the source location too.
    private var transferPreselection: TransferPreselection {
        let stocked = (viewModel.availability?.locations ?? []).filter { $0.quantity > 0 }
        return TransferPreselection(
            rawMaterialId: nil,
            recipeId: recipeId,
            fromLocationId: stocked.count == 1 ? stocked[0].locationId : nil
        )
    }

    // MARK: - Info Section

    @ViewBuilder
    private func infoSection(_ recipe: RecipeStockResponse) -> some View {
        Section("Informații") {
            LabeledContent("Tip", value: recipe.type.displayName)

            if permissions.can(.update, .Recipe) {
                StockChooserRow(
                    label: "Categorie",
                    options: viewModel.categories.map { StockChoice(id: $0, title: $0) },
                    selection: Binding(
                        get: { selectedCategory.isEmpty ? nil : selectedCategory },
                        set: { selectedCategory = $0 ?? "" }
                    ),
                    noneTitle: StockText.noCategory
                )
                .onChange(of: selectedCategory) { _, newValue in
                    guard !newValue.isEmpty, newValue != recipe.category else { return }
                    Task { await viewModel.updateCategory(to: newValue) }
                }
                .onAppear { selectedCategory = recipe.category ?? "" }
            } else if let category = recipe.category {
                LabeledContent("Categorie", value: category)
            }

            if !recipe.flavors.isEmpty {
                LabeledContent("Arome") {
                    Text(recipe.flavors.joined(separator: ", "))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Pricing Section

    @ViewBuilder
    private func pricingSection(_ recipe: RecipeStockResponse) -> some View {
        Section("Preturi") {
            if permissions.can(.update, .Recipe) {
                HStack {
                    Text("Preț vânzare")
                    Spacer()
                    TextField("0.00", text: $viewModel.editedSellingPrice)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 100)
                    Text("RON")
                        .foregroundStyle(.secondary)
                }
                .onSubmit { Task { await viewModel.updateSellingPrice() } }

                if viewModel.editedSellingPrice != String(format: "%.2f", recipe.sellingPrice ?? 0) {
                    Button {
                        Task { await viewModel.updateSellingPrice() }
                    } label: {
                        HStack {
                            Image(systemName: "checkmark.circle")
                                .foregroundStyle(AppTheme.Colors.primary)
                            Text("Salvează prețul")
                                .foregroundStyle(Color.primary)
                        }
                    }
                    .disabled(viewModel.isSaving)
                }
            } else if let price = recipe.sellingPrice {
                LabeledContent("Preț vânzare", value: String(format: "%.2f RON", price))
            }

            if let cost = viewModel.recipeCost {
                if let totalCost = cost.totalCost {
                    LabeledContent("Cost ingrediente", value: String(format: "%.2f RON", totalCost))
                }
                if let margin = cost.margin {
                    LabeledContent("Marja") {
                        let percent = cost.marginPercent ?? 0
                        Text(String(format: "%.2f RON (%.1f%%)", margin, percent))
                            .foregroundStyle(margin >= 0 ? .green : .red)
                    }
                }
            }
        }
    }

    // MARK: - Stock Section

    @ViewBuilder
    private func stockSection(_ recipe: RecipeStockResponse) -> some View {
        // Total always (even 0); Rezervat/Disponibil only when something is
        // actually reserved — otherwise they just repeat the total.
        Section("Stoc") {
            LabeledContent("Stoc", value: "\(recipe.unit.formatQty(recipe.stockCount))")
            if recipe.reservedCount > 0 {
                let available = recipe.stockCount - recipe.reservedCount
                LabeledContent("Disponibil") {
                    Text("\(recipe.unit.formatQty(available))")
                        .foregroundStyle(.orange)
                }
                LabeledContent("Rezervat") {
                    Text("\(recipe.unit.formatQty(recipe.reservedCount))")
                        .foregroundStyle(.orange)
                }
            }
        }

        if permissions.can(.create, .StockMovement) {
            Section("Ajustare stoc") {
                Stepper("Cantitate: \(viewModel.adjustmentQuantity)", value: $viewModel.adjustmentQuantity, in: 1...999)

                HStack(spacing: 12) {
                    Button {
                        let newStock = max(0, recipe.stockCount - Double(viewModel.adjustmentQuantity))
                        Task { await viewModel.requestAdjust(type: .AJUSTARE, quantity: newStock) }
                    } label: {
                        HStack {
                            Image(systemName: "minus")
                            Text("\(viewModel.adjustmentQuantity)")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                    .disabled(viewModel.isSaving || recipe.stockCount <= 0)

                    Button {
                        Task { await viewModel.requestAdjust(type: .INTRARE, quantity: Double(viewModel.adjustmentQuantity)) }
                    } label: {
                        HStack {
                            Image(systemName: "plus")
                            Text("\(viewModel.adjustmentQuantity)")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(viewModel.isSaving)
                }

                Button {
                    absoluteStockText = recipe.stockCount.qtyFormatted
                    showSetStockAlert = true
                } label: {
                    HStack {
                        Image(systemName: "number")
                        Text("Seteaza stoc exact")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(viewModel.isSaving)

                Button(role: .destructive) {
                    Task { await viewModel.requestAdjust(type: .AJUSTARE, quantity: 0) }
                } label: {
                    HStack {
                        Image(systemName: "arrow.down.to.line")
                        Text("Adu la 0")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(viewModel.isSaving || recipe.stockCount <= 0)

                TextField(
                    "Notiță (opțional) — apare în istoricul de mișcări",
                    text: $viewModel.adjustmentNote,
                    axis: .vertical
                )
                .lineLimit(1...3)
            }
        }

    }

    // MARK: - Lots Section

    /// Loturile de productie, intr-un expander care isi incarca datele abia la
    /// deschidere — fisa se deschide la fel de repede ca inainte.
    @ViewBuilder
    private func lotsSection(_ recipe: RecipeStockResponse) -> some View {
        Section {
            DisclosureGroup(isExpanded: $lotsExpanded) {
                if viewModel.isLoadingLots {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        ProgressView()
                        Text("Se încarcă loturile…")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                } else if viewModel.lots.isEmpty {
                    Text("Fără loturi — stoc dinaintea versiunii 1.21")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(viewModel.lots) { lot in
                        RecipeLotRow(lot: lot, unit: recipe.unit)
                    }
                    // ClickUp "Stoc diferentiat nume": total la finalul listei.
                    HStack {
                        Text("Total · \(viewModel.lots.count) \(viewModel.lots.count == 1 ? "lot" : "loturi")")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        Text(
                            "\(recipe.unit.formatQty(viewModel.lots.reduce(0) { $0 + $1.remainingQuantity })) / \(recipe.unit.formatQty(viewModel.lots.reduce(0) { $0 + $1.quantity }))"
                        )
                        .font(.subheadline.weight(.semibold))
                    }
                }
            } label: {
                HStack {
                    Label("Loturi", systemImage: "shippingbox")
                    Spacer()
                    if viewModel.lotsLoaded, !viewModel.lots.isEmpty {
                        Text("\(viewModel.lots.count)")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .tutorialAnchor(id: "stock.finishedGoods.lots")
            .onChange(of: lotsExpanded) {
                if lotsExpanded { Task { await viewModel.loadLots() } }
            }
        } footer: {
            if lotsExpanded, !viewModel.lots.isEmpty {
                Text("Consumul se face FIFO: intai lotul cu expirarea cea mai apropiata.")
                    .tutorialAnchor(id: "stock.finishedGoods.fifo")
            }
        }
    }

    // MARK: - Movements Section

    @ViewBuilder
    private var movementsSection: some View {
        if !viewModel.movements.isEmpty {
            Section("Mișcări recente") {
                ForEach(viewModel.movements) { mov in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(mov.movementType.displayName)
                                .font(.body)
                            Text(StockDate.shortTime(mov.createdAt))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if let note = mov.referenceNote, !note.isEmpty {
                                Text(note)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                        Spacer()
                        Text(mov.unit.formatQty(mov.quantity))
                            .font(.subheadline.bold())
                    }
                }
            }
        }
    }
}

// MARK: - Lot Row

/// Un lot de productie: numar, data producerii, cat a mai ramas din cat s-a
/// produs si expirarea (rosu = expirat, portocaliu = sub 3 zile).
private struct RecipeLotRow: View {
    let lot: RecipeLotResponse
    let unit: UnitType

    private var expiryColor: Color {
        if lot.isExpired { return AppTheme.Colors.destructive }
        if lot.expiresSoon { return .orange }
        return .secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
            HStack(alignment: .firstTextBaseline) {
                Text(lot.lotNumber)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Spacer()
                // Ramas / total, ca sa se vada cat s-a consumat din lot.
                Text("\(lot.remainingQuantity.qtyFormatted)/\(unit.formatQty(lot.quantity))")
                    .font(.subheadline.weight(.semibold).monospacedDigit())
            }

            Text("Produs la \(lot.producedAt.dottedDate)")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let expiryDate = lot.expiryDate {
                Text("\(lot.isExpired ? "Expirat la" : "Expira la") \(expiryDate.dottedDate)")
                    .font(.caption)
                    .foregroundStyle(expiryColor)
            }

            if let locationName = lot.locationName, !locationName.isEmpty {
                Text(locationName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, AppTheme.Spacing.xxs)
        .accessibilityElement(children: .combine)
    }
}
