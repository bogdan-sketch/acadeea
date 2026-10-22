import SwiftUI

/// Stock tab root — location picker + ONE colour-coded category carousel + a single
/// combined stock list (raw materials + produced recipes) for the selected location.
struct StockOverviewView: View {
    // Selection
    @State private var selectedLocation: LocationResponse?
    /// Selected category chip (nil = "Toate", `miscSentinel` = no category).
    @State private var selectedCategory: String?
    /// The three-tile dial: MATERIE_PRIMA | SEMIPREPARAT | PRODUS_FINIT (nil = all).
    @State private var selectedKind: String?
    /// Category groups the user folded (tap on the pill header).
    @State private var collapsedGroups: Set<String> = []
    /// Cautare nativa in listele de stoc (drawer, apare la tras in jos).
    @State private var searchText = ""
    /// Filtru status condus de cardurile quick-info (nil = "toate" — default).
    @State private var selectedStatus: MaterialStatus?
    /// Stoc minim + discontinued per materie prima — statusul unui RAND se
    /// deriva din CANTITATEA randului (per-locatie sau cumulata) + acest min,
    /// cu aceeasi regula ca API-ul (qty<=0 → fara stoc, qty<=min → scazut).
    @State private var materialMetaById: [String: MaterialMeta] = [:]
    /// Cantitatile per-locatie (pe id), pentru vederea "toate locatiile": un
    /// rand apare la un status daca ORICARE locatie e in acel status (uniune),
    /// nu doar cand totalul cumulat e (altfel "fara stoc" = 0 în TOATE locatiile
    /// = intersectie, si pierdeai produsele fara stoc doar într-o locatie).
    @State private var rawPerLocationQtyById: [String: [Double]] = [:]
    @State private var recipePerLocationQtyById: [String: [Double]] = [:]

    private struct MaterialMeta {
        let minimumStock: Double
        let discontinued: Bool
    }

    // Data — shared
    @State private var locations: [LocationResponse] = []
    @State private var lowStockItems: [LowStockItem] = []
    @State private var stockStats: StockStatsResponse?
    /// One carousel of every category across all kinds with its effective colour.
    @State private var carouselCategories: [CarouselCategory] = []

    // Data — raw materials
    @State private var locationStock: [LocationStockResponse] = []
    @State private var isLoadingStock = false
    @State private var cumulatedStock: [CumulatedStockItem] = []
    @State private var isLoadingCumulated = false

    // Data — recipe stock (semipreparate + produse finite)
    @State private var locationRecipeStock: [LocationRecipeStockResponse] = []
    @State private var isLoadingRecipeStock = false
    @State private var cumulatedRecipeStock: [CumulatedRecipeStockItem] = []
    @State private var isLoadingCumulatedRecipe = false

    @State private var showCreateRaw = false
    @State private var showCreateConsumable = false
    @State private var showSearch = false
    /// Collapsing head — hidden while the list scrolls down.
    @State private var headVisible = true

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }
    @Environment(\.horizontalSizeClass) private var sizeClass

    /// Sentinel value for uncategorized products ("Fără categorie").
    private static let miscSentinel = "__none__"

    var body: some View {
        // Collapsing head (title, search, action strip, kind tiles) over the
        // pinned pill rows (locations + Epuizate, categories); only the list
        // scrolls — and only the list pulls to refresh.
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                header
                if showSearch || !searchText.isEmpty {
                    HInlineSearchField(text: $searchText, prompt: "Caută produs, categorie…") {
                        withAnimation(.snappy) { showSearch = false }
                    }
                    .padding(.horizontal, gutter)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
                quickActions
                StockKindTiles(kinds: kindCounts, selection: $selectedKind)
                    .padding(.horizontal, gutter)
                    .tutorialAnchor(id: "stock.finishedGoods.overview")
            }
            .padding(.top, AppTheme.Spacing.sm)
            .padding(.bottom, 10)
            .autoCollapsible(headVisible)

            VStack(alignment: .leading, spacing: 8) {
                locationChips
                if selectedKind != nil { categoryChips }
            }
            .padding(.top, headVisible ? 0 : AppTheme.Spacing.sm)
            .padding(.bottom, 8)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10, pinnedViews: []) {
                    content
                        .padding(.horizontal, gutter)
                    journalLinks
                }
                .padding(.top, 2)
                // Room for the FAB over the last group.
                .padding(.bottom, 88)
            }
            .refreshable { await Task { await refreshAll() }.value }
            .autoHideOnScroll($headVisible)
        }
        .scrollDismissesKeyboard(.immediately)
        .background(AppTheme.Colors.appBackground.ignoresSafeArea())
        .overlay {
            if permissions.can(.create, .RawMaterial) {
                HFabMenu(label: "Adaugă materie primă sau consumabil", items: [
                    HFabMenuItem("Materie primă", systemImage: "leaf") { showCreateRaw = true },
                    HFabMenuItem("Consumabil", systemImage: "shippingbox") { showCreateConsumable = true }
                ])
            }
        }
        // The in-content header replaces the bar (prototype); on iPad the
        // header title carries the sidebar toggle.
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadLocations()
            applyDeepLinkIfPending()
            await loadLowStock()
            await loadStockStats()
            await loadCarousel()
            await loadCumulatedStock()
            await loadCumulatedRecipeStock()
        }
        .task { await SalesDeductionFeature.shared.refresh() }
        .onChange(of: StockDeepLink.shared.requestID) {
            applyDeepLinkIfPending()
        }
        .onChange(of: selectedLocation) {
            selectedCategory = nil
            if let loc = selectedLocation {
                Task {
                    await loadLocationStock(loc.id)
                    await loadLocationRecipeStock(loc.id)
                }
            }
        }
        .onChange(of: selectedKind) { _, _ in selectedCategory = nil }
        .sheet(isPresented: $showCreateRaw) {
            NavigationStack {
                CreateRawMaterialFormView(
                    initialCategory: nil,
                    onCreate: { _ in showCreateRaw = false; Task { await refreshAfterAdd() } },
                    onCancel: { showCreateRaw = false }
                )
            }
            // A sheet is its own presentation host: anchor preferences never
            // reach the AppTabView overlay, so hints inside it need their own.
            .tutorialOverlay()
        }
        .sheet(isPresented: $showCreateConsumable) {
            NavigationStack {
                CreateConsumableFormView(
                    initialCategory: nil,
                    onCreate: { _ in showCreateConsumable = false; Task { await refreshAfterAdd() } },
                    onCancel: { showCreateConsumable = false }
                )
            }
        }
    }

    // MARK: - Header

    private var gutter: CGFloat { sizeClass == .regular ? AdaptiveLayout.gutter : 16 }

    /// "214 articole · 1 epuizat · 3 sub minim" — from the stock stats.
    private var eyebrow: String? {
        guard let stats = stockStats else { return nil }
        var parts = ["\(stats.totalItems) \(stats.totalItems == 1 ? "articol" : "articole")"]
        let out = stats.statusCounts["OUT_OF_STOCK"] ?? 0
        let low = stats.statusCounts["LOW_STOCK"] ?? 0
        if out > 0 { parts.append("\(out) \(out == 1 ? "epuizat" : "epuizate")") }
        if low > 0 { parts.append("\(low) sub minim") }
        return parts.joined(separator: " · ")
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 10) {
            HScreenTitle("Stoc", eyebrow: eyebrow)
            HIconButton("magnifyingglass", label: "Caută produs în stoc") {
                withAnimation(.snappy) { showSearch.toggle() }
                if !showSearch { searchText = "" }
            }
        }
        .padding(.horizontal, sizeClass == .regular ? AdaptiveLayout.gutter : 20)
    }

    // MARK: - Category helpers

    /// Distinct category chips (by name) with their effective colour, in the
    /// admin-defined order the server returns (super-category order, then each
    /// category's sortOrder) — NOT re-sorted alphabetically.
    private var carouselChips: [CarouselCategory] {
        var seen = Set<String>()
        var result: [CarouselCategory] = []
        for cat in carouselCategories where !cat.name.isEmpty {
            if seen.insert(cat.name).inserted { result.append(cat) }
        }
        return result
    }

    private func colorHex(forCategory name: String) -> String? {
        carouselCategories.first { $0.name == name }?.color
    }

    private func matchesSearch(_ title: String) -> Bool {
        searchText.isEmpty || title.localizedCaseInsensitiveContains(searchText)
    }

    private func matchesCategory(_ category: String?) -> Bool {
        guard let sel = selectedCategory else { return true }
        if sel == Self.miscSentinel { return (category ?? "").isEmpty }
        if category == sel { return true }
        // A parent category also matches its sub-categories.
        return carouselCategories.contains { $0.name == category && $0.parentName == sel }
    }

    // MARK: - Status filter helpers

    /// Statusul se deriva din cantitatea RANDULUI (per-locatie in vederea de
    /// locatie, cumulata in "Toate") + stocul minim al materialului — asa
    /// filtrul respecta ce vezi in lista, nu statusul global al materialului.
    private func rawMatchesStatus(quantity: Double, materialId: String) -> Bool {
        guard let sel = selectedStatus else { return true } // "Toate"
        let meta = materialMetaById[materialId]
        if meta?.discontinued == true { return sel == .DISCONTINUED }
        let status: MaterialStatus =
            quantity <= 0 ? .OUT_OF_STOCK
            : (quantity <= (meta?.minimumStock ?? 0) ? .LOW_STOCK : .ACTIVE)
        return status == sel
    }

    /// Produsele/semipreparatele nu au stoc minim, deci doar activ/fara stoc.
    private func recipeMatchesStatus(quantity: Double) -> Bool {
        switch selectedStatus {
        case nil: true
        case .OUT_OF_STOCK: quantity <= 0
        case .ACTIVE: quantity > 0
        default: false
        }
    }

    /// "Toate locatiile": un material se potriveste cu statusul daca ORICARE
    /// locatie il are in acel status (uniune peste locatii). Fara randuri
    /// per-locatie (material nealocat) cade pe cantitatea cumulata.
    private func rawMatchesStatusUnion(materialId: String, cumulatedQuantity: Double) -> Bool {
        guard selectedStatus != nil else { return true }
        guard let qtys = rawPerLocationQtyById[materialId], !qtys.isEmpty else {
            return rawMatchesStatus(quantity: cumulatedQuantity, materialId: materialId)
        }
        return qtys.contains { rawMatchesStatus(quantity: $0, materialId: materialId) }
    }

    /// Idem pentru retete (produse finite / semipreparate) — uniune per-locatie.
    private func recipeMatchesStatusUnion(recipeId: String, cumulatedQuantity: Double) -> Bool {
        guard selectedStatus != nil else { return true }
        guard let qtys = recipePerLocationQtyById[recipeId], !qtys.isEmpty else {
            return recipeMatchesStatus(quantity: cumulatedQuantity)
        }
        return qtys.contains { recipeMatchesStatus(quantity: $0) }
    }

    /// Tap pe card: filtreaza; tap pe cardul deja activ → inapoi la "toate".
    private func toggleStatusFilter(_ status: MaterialStatus?) {
        selectedStatus = (selectedStatus == status) ? nil : status
    }

    /// Aplica intentia de pe homepage (filtru + locatie), o singura data.
    private func applyDeepLinkIfPending() {
        guard let intent = StockDeepLink.shared.consume() else { return }
        if let locId = intent.locationId {
            selectedLocation = locations.first { $0.id == locId }
        } else {
            selectedLocation = nil
        }
        selectedStatus = intent.status
    }

    // MARK: - Location chips

    private var locationChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                // Fara chip "Toate" — tap pe locatia ACTIVA revine la toate.
                ForEach(locations) { location in
                    HChip(location.name, isSelected: selectedLocation?.id == location.id) {
                        selectedLocation = selectedLocation?.id == location.id ? nil : location
                    }
                    .help("Arată stocul din \(location.name) — apasă din nou pentru toate locațiile")
                }
                if !locations.isEmpty {
                    Rectangle()
                        .fill(AppTheme.Colors.border)
                        .frame(width: 1, height: 20)
                        .padding(.horizontal, 4)
                        .accessibilityHidden(true)
                }
                // "Epuizate": toggle filter — only what is at 0; tap again → all.
                HChip(
                    "Epuizate",
                    isSelected: selectedStatus == .OUT_OF_STOCK,
                    dot: AppTheme.Status.fg(.danger)
                ) { toggleStatusFilter(.OUT_OF_STOCK) }
                .help("Doar produsele epuizate — apasă din nou pentru toate")
            }
            .padding(.horizontal, gutter)
            .padding(.vertical, 2)
        }
    }

    // MARK: - Category chips

    /// Categories of the chosen kind as chips with their item count; tap the
    /// active chip again to clear. No "Toate".
    private var categoryChips: some View {
        let counts = chipCounts
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(chipCategories) { cat in
                    HChip(cat.name, count: counts[cat.name], isSelected: selectedCategory == cat.name) {
                        selectedCategory = selectedCategory == cat.name ? nil : cat.name
                    }
                }
            }
            .padding(.horizontal, gutter)
            .padding(.vertical, 2)
        }
    }

    /// Items per chip (a parent counts its sub-categories) for the chosen kind,
    /// with search + status filters applied.
    private var chipCounts: [String: Int] {
        guard let selectedKind else { return [:] }
        let cats: [String?]
        if selectedLocation != nil {
            cats = selectedKind == "MATERIE_PRIMA"
                ? locationStock.filter { matchesSearch($0.rawMaterialTitle) && rawMatchesStatus(quantity: $0.quantity, materialId: $0.rawMaterialId) }.map(\.category)
                : locationRecipeStock.filter { Self.kindKey($0.recipeType) == selectedKind && matchesSearch($0.recipeName) && recipeMatchesStatus(quantity: $0.quantity) }.map(\.category)
        } else {
            cats = selectedKind == "MATERIE_PRIMA"
                ? cumulatedStock.filter { matchesSearch($0.title) && rawMatchesStatusUnion(materialId: $0.rawMaterialId, cumulatedQuantity: $0.quantity) }.map(\.category)
                : cumulatedRecipeStock.filter { Self.kindKey($0.recipeType) == selectedKind && matchesSearch($0.recipeName) && recipeMatchesStatusUnion(recipeId: $0.recipeId, cumulatedQuantity: $0.quantity) }.map(\.category)
        }
        let rows = carouselCategories.filter { $0.kind == selectedKind }
        var counts: [String: Int] = [:]
        for case let cat? in cats {
            counts[cat, default: 0] += 1
            if let parent = rows.first(where: { $0.name == cat })?.parentName {
                counts[parent, default: 0] += 1
            }
        }
        return counts
    }

    /// Items per super-category for the dial: search + status filters applied,
    /// NOT the category chip — the three tiles always stay.
    private var kindCounts: [(key: String, count: Int)] {
        let rawCats: [String?]
        let recipeTypesAndCats: [(RecipeType, String?)]
        if selectedLocation != nil {
            rawCats = locationStock
                .filter { matchesSearch($0.rawMaterialTitle) && rawMatchesStatus(quantity: $0.quantity, materialId: $0.rawMaterialId) }
                .map(\.category)
            recipeTypesAndCats = locationRecipeStock
                .filter { matchesSearch($0.recipeName) && recipeMatchesStatus(quantity: $0.quantity) }
                .map { ($0.recipeType, $0.category) }
        } else {
            rawCats = cumulatedStock
                .filter { matchesSearch($0.title) && rawMatchesStatusUnion(materialId: $0.rawMaterialId, cumulatedQuantity: $0.quantity) }
                .map(\.category)
            recipeTypesAndCats = cumulatedRecipeStock
                .filter { matchesSearch($0.recipeName) && recipeMatchesStatus(quantity: $0.quantity) }
                .map { ($0.recipeType, $0.category) }
        }
        return [
            (key: "MATERIE_PRIMA", count: rawCats.count),
            (key: "SEMIPREPARAT", count: recipeTypesAndCats.filter { $0.0 == .SEMIPREPARAT }.count),
            (key: "PRODUS_FINIT", count: recipeTypesAndCats.filter { $0.0 == .FINAL }.count),
        ]
    }

    /// Categories of the chosen big category that actually hold items (a parent
    /// counts its children) — empty chips are hidden.
    private var chipCategories: [CarouselCategory] {
        guard let selectedKind else { return [] }
        let cats: [String?]
        switch selectedKind {
        case "MATERIE_PRIMA":
            cats = selectedLocation != nil ? locationStock.map(\.category) : cumulatedStock.map(\.category)
        case "SEMIPREPARAT":
            cats = selectedLocation != nil
                ? locationRecipeStock.filter { $0.recipeType == .SEMIPREPARAT }.map(\.category)
                : cumulatedRecipeStock.filter { $0.recipeType == .SEMIPREPARAT }.map(\.category)
        default:
            cats = selectedLocation != nil
                ? locationRecipeStock.filter { $0.recipeType == .FINAL }.map(\.category)
                : cumulatedRecipeStock.filter { $0.recipeType == .FINAL }.map(\.category)
        }
        let rows = carouselCategories.filter { $0.kind == selectedKind }
        return rows.filter { row in
            cats.contains { c in c == row.name || rows.contains { $0.name == c && $0.parentName == row.name } }
        }
    }

    private func toggleGroup(_ id: String) {
        withAnimation(.snappy) {
            if collapsedGroups.contains(id) { collapsedGroups.remove(id) } else { collapsedGroups.insert(id) }
        }
    }

    private static func kindKey(_ type: RecipeType) -> String {
        type == .SEMIPREPARAT ? "SEMIPREPARAT" : "PRODUS_FINIT"
    }

    /// Entries of one kind grouped by category, in carousel order, "Fără categorie" last.
    private func categorySections(kind: String, entries: [(category: String?, entry: StockListEntry)]) -> [StockListSection] {
        var order: [String] = []
        var byCat: [String: [StockListEntry]] = [:]
        for (category, entry) in entries {
            let key = category.flatMap { $0.isEmpty ? nil : $0 } ?? StockText.noCategory
            if byCat[key] == nil { order.append(key) }
            byCat[key, default: []].append(entry)
        }
        let rank = Dictionary(uniqueKeysWithValues: carouselCategories.enumerated().map { ($1.name, $0) })
        order.sort { a, b in
            if a == StockText.noCategory { return false }
            if b == StockText.noCategory { return true }
            return (rank[a] ?? Int.max) < (rank[b] ?? Int.max)
        }
        return order.map { StockListSection(title: $0, entries: byCat[$0] ?? [], kind: kind) }
    }

    // MARK: - Content (combined list)

    @ViewBuilder
    private var content: some View {
        if selectedLocation != nil {
            locationCombinedList
        } else {
            cumulatedCombinedList
        }
    }

    // MARK: - Per-location combined list

    private var filteredLocationStock: [LocationStockResponse] {
        locationStock.filter { matchesSearch($0.rawMaterialTitle) && matchesCategory($0.category) && rawMatchesStatus(quantity: $0.quantity, materialId: $0.rawMaterialId) }
    }

    private var filteredLocationRecipeStock: [LocationRecipeStockResponse] {
        locationRecipeStock.filter { matchesSearch($0.recipeName) && matchesCategory($0.category) && recipeMatchesStatus(quantity: $0.quantity) }
    }

    private var isLoadingLocationCombined: Bool {
        (isLoadingStock && locationStock.isEmpty) || (isLoadingRecipeStock && locationRecipeStock.isEmpty)
    }

    @ViewBuilder
    private var locationCombinedList: some View {
        let locName = selectedLocation?.name ?? ""
        let rawItems = filteredLocationStock
        let recipeItems = filteredLocationRecipeStock

        if isLoadingLocationCombined {
            ProgressView().frame(maxWidth: .infinity, minHeight: 200)
        } else if rawItems.isEmpty && recipeItems.isEmpty {
            ContentUnavailableView(
                "Niciun produs",
                systemImage: "shippingbox",
                description: Text("Niciun produs la \(locName)")
            )
            .frame(minHeight: 260)
        } else {
            stockSections(locationSections(rawItems: rawItems, recipeItems: recipeItems))
        }
    }

    // MARK: - Cumulated combined list (Toate locatiile)

    private var filteredCumulatedStock: [CumulatedStockItem] {
        cumulatedStock.filter {
            matchesSearch($0.title) && matchesCategory($0.category)
                && rawMatchesStatusUnion(materialId: $0.rawMaterialId, cumulatedQuantity: $0.quantity)
        }
    }

    private var filteredCumulatedRecipeStock: [CumulatedRecipeStockItem] {
        cumulatedRecipeStock.filter {
            matchesSearch($0.recipeName) && matchesCategory($0.category)
                && recipeMatchesStatusUnion(recipeId: $0.recipeId, cumulatedQuantity: $0.quantity)
        }
    }

    private var isLoadingCumulatedCombined: Bool {
        (isLoadingCumulated && cumulatedStock.isEmpty) || (isLoadingCumulatedRecipe && cumulatedRecipeStock.isEmpty)
    }

    @ViewBuilder
    private var cumulatedCombinedList: some View {
        let rawItems = filteredCumulatedStock
        let recipeItems = filteredCumulatedRecipeStock

        if isLoadingCumulatedCombined {
            ProgressView().frame(maxWidth: .infinity, minHeight: 200)
        } else if rawItems.isEmpty && recipeItems.isEmpty {
            ContentUnavailableView("Niciun produs", systemImage: "shippingbox")
                .frame(minHeight: 260)
        } else {
            stockSections(cumulatedSections(rawItems: rawItems, recipeItems: recipeItems))
        }
    }

    private func locationSections(rawItems: [LocationStockResponse], recipeItems: [LocationRecipeStockResponse]) -> [StockListSection] {
        var sections: [StockListSection] = []
        if selectedKind == nil || selectedKind == "MATERIE_PRIMA", !rawItems.isEmpty {
            sections += categorySections(kind: "MATERIE_PRIMA", entries: rawItems.map { stock in
                (stock.category, rawEntry(
                    materialId: stock.rawMaterialId, title: stock.rawMaterialTitle,
                    unit: stock.unit, quantity: stock.quantity))
            })
        }
        for type in RecipeType.allCases where selectedKind == nil || selectedKind == Self.kindKey(type) {
            let items = recipeItems.filter { $0.recipeType == type }
            if !items.isEmpty {
                sections += categorySections(kind: Self.kindKey(type), entries: items.map { stock in
                    (stock.category, recipeEntry(
                        recipeId: stock.recipeId, title: stock.recipeName, unit: stock.unit,
                        quantity: stock.quantity, reserved: stock.reservedCount, expiryDate: stock.expiryDate))
                })
            }
        }
        return sections
    }

    private func cumulatedSections(rawItems: [CumulatedStockItem], recipeItems: [CumulatedRecipeStockItem]) -> [StockListSection] {
        var sections: [StockListSection] = []
        if selectedKind == nil || selectedKind == "MATERIE_PRIMA", !rawItems.isEmpty {
            sections += categorySections(kind: "MATERIE_PRIMA", entries: rawItems.map { item in
                (item.category, rawEntry(
                    materialId: item.rawMaterialId, title: item.title, unit: item.unit,
                    quantity: item.quantity, unassigned: item.unassigned))
            })
        }
        for type in RecipeType.allCases where selectedKind == nil || selectedKind == Self.kindKey(type) {
            let items = recipeItems.filter { $0.recipeType == type }
            if !items.isEmpty {
                sections += categorySections(kind: Self.kindKey(type), entries: items.map { item in
                    (item.category, recipeEntry(
                        recipeId: item.recipeId, title: item.recipeName, unit: item.unit,
                        quantity: item.quantity, reserved: 0, expiryDate: nil))
                })
            }
        }
        return sections
    }

    // MARK: - Entry builders

    /// Raw material line: status from the row quantity + the material minimum
    /// (same rule as the API); sub-line = minimum or "not in any location".
    private func rawEntry(
        materialId: String, title: String, unit: UnitType, quantity: Double, unassigned: Bool = false
    ) -> StockListEntry {
        let minimum = materialMetaById[materialId]?.minimumStock ?? 0
        let status: AppTheme.Status.Kind =
            quantity <= 0 ? .danger : (minimum > 0 && quantity <= minimum ? .warning : .ready)
        var subtitle: String?
        var tone: AppTheme.Status.Kind?
        if unassigned {
            subtitle = "Neasignat la nicio locație"
            tone = .warning
        } else if minimum > 0 {
            subtitle = "min \(unit.humanizedString(minimum))"
        }
        return StockListEntry(
            id: "raw-\(materialId)", route: .rawMaterialDetail(id: materialId), title: title,
            unit: unit, quantity: quantity, subtitle: subtitle, subtitleTone: tone, status: status)
    }

    /// Produced recipe line: reserved + earliest expiry (red within a week).
    private func recipeEntry(
        recipeId: String, title: String, unit: UnitType, quantity: Double, reserved: Double, expiryDate: Date?
    ) -> StockListEntry {
        var parts: [String] = []
        if reserved > 0 { parts.append("\(unit.humanizedString(reserved)) rezervat") }
        var tone: AppTheme.Status.Kind?
        if let expiryDate {
            parts.append("exp \(expiryDate.dayMonth)")
            if expiryDate.timeIntervalSinceNow <= 7 * 24 * 60 * 60 { tone = .danger }
        }
        return StockListEntry(
            id: "recipe-\(recipeId)", route: .recipeStockDetail(id: recipeId), title: title,
            unit: unit, quantity: quantity,
            subtitle: parts.isEmpty ? nil : parts.joined(separator: " · "), subtitleTone: tone,
            status: quantity <= 0 ? .danger : .ready)
    }

    // MARK: - Section renderer (cards; two+ columns on iPad)

    /// Each category is a card (pill header + rows). iPhone: one column;
    /// iPad: an adaptive grid of group cards.
    @ViewBuilder
    private func stockSections(_ sections: [StockListSection]) -> some View {
        if sizeClass == .regular {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 340), spacing: 12, alignment: .top)],
                alignment: .leading, spacing: 12
            ) {
                ForEach(sections) { groupCard($0) }
            }
        } else {
            LazyVStack(spacing: 8) {
                ForEach(sections) { groupCard($0) }
            }
        }
    }

    private func groupCard(_ section: StockListSection) -> some View {
        StockGroupCard(
            title: section.title,
            kind: section.kind,
            count: section.entries.count,
            isCollapsed: collapsedGroups.contains(section.id),
            onToggle: { toggleGroup(section.id) }
        ) {
            ForEach(section.entries) { entry in
                NavigationLink(value: entry.route) {
                    StockItemRow(
                        title: entry.title,
                        subtitle: entry.subtitle,
                        subtitleTone: entry.subtitleTone,
                        quantity: entry.unit.stockDisplay(entry.quantity),
                        status: entry.status
                    )
                    .masterDetailHighlight(entry.route)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Quick Actions

    /// Horizontally scrolling action pills, web order: Recepție · Transfer ·
    /// Mișcare · Teste · Expirări · Necesar · Furnizori. "Epuizate" is a
    /// filter chip in the location row; journals live in `journalLinks`.
    private var quickActions: some View {
        let canMove = permissions.can(.create, .StockMovement)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if canMove {
                    HQuickActionChip("Recepție", systemImage: "arrow.down", help: "Recepție marfă: loturi, factură, furnizor", destination: .batchReceive)
                        .tutorialAnchor(id: "stock.receive.open")
                }
                if permissions.can(.create, .StockTransfer) {
                    HQuickActionChip("Transfer", systemImage: "arrow.left.arrow.right", help: "Muți stoc dintr-o locație în alta", destination: .transferCreate)
                        .tutorialAnchor(id: "stock.transfers.open")
                }
                if canMove {
                    HQuickActionChip("Mișcare", systemImage: "slider.horizontal.3", help: "Intrare sau ajustare manuală", destination: .stockMovementCreate)
                }
                // Scoate din stoc ce se consuma la teste/R&D.
                if permissions.can(.update, .RawMaterial) || permissions.can(.update, .Consumable) {
                    HQuickActionChip("Teste", systemImage: "flask", help: "Consum pentru teste și R&D", destination: .testConsumption)
                        .tutorialAnchor(id: "stock.testConsumption.open")
                }
                HQuickActionChip("Expirări", systemImage: "hourglass", help: "Ce expiră în zilele următoare", destination: .expiryTracking)
                HQuickActionChip("Necesar", systemImage: "basket", help: "Materii prime necesare pentru taskurile planificate", destination: .requirementsPlan)
                HQuickActionChip("Furnizori", systemImage: "truck.box", help: "Furnizorii și produsele lor", destination: .suppliers)
            }
            .padding(.horizontal, gutter)
            .padding(.vertical, 2)
        }
    }

    /// Journals and admin tools that left the strip (web parity) but must stay
    /// reachable on iPhone, where there is no sidebar.
    private var journalLinks: some View {
        VStack(alignment: .leading, spacing: 8) {
            HSectionHeader("Jurnale și unelte")
            HCard(padding: 0) {
                VStack(spacing: 0) {
                    journalRow("Transferuri", systemImage: "arrow.left.arrow.right", route: .transferList)
                    StockDivider().padding(.leading, 48)
                    journalRow("Mișcări de stoc", systemImage: "list.bullet.rectangle", route: .stockMovements)
                    if permissions.isAdmin {
                        StockDivider().padding(.leading, 48)
                        journalRow("Revizie stocuri", systemImage: "checkmark.rectangle.stack", route: .stockReview)
                    }
                    if SalesDeductionFeature.shared.isAvailable(permissions) {
                        StockDivider().padding(.leading, 48)
                        journalRow("Vânzări → stoc", systemImage: "receipt", route: .salesDeductions)
                    }
                }
            }
        }
        .padding(.horizontal, gutter)
        .padding(.top, 8)
    }

    private func journalRow(_ title: String, systemImage: String, route: Route) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .frame(width: 24)
                    .accessibilityHidden(true)
                Text(title)
                    .font(AppFont.body(14, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func refreshAll() async {
        await loadStockStats()
        await loadLowStock()
        if let loc = selectedLocation {
            await loadLocationStock(loc.id)
            await loadLocationRecipeStock(loc.id)
        } else {
            await loadCumulatedStock()
            await loadCumulatedRecipeStock()
        }
    }

    // MARK: - Data

    private func refreshAfterAdd() async {
        await loadStockStats()
        await loadLowStock()
        await loadCumulatedStock()
        await loadCumulatedRecipeStock()
        if let loc = selectedLocation {
            await loadLocationStock(loc.id)
            await loadLocationRecipeStock(loc.id)
        }
    }

    private func loadLocations() async {
        do { locations = try await LocationService.shared.fetchLocations() } catch {}
    }

    private func loadLowStock() async {
        do { lowStockItems = try await StockService.shared.fetchLowStock() } catch {}
    }

    private func loadStockStats() async {
        do { stockStats = try await StockService.shared.fetchStockStats() } catch {}
    }

    private func loadCarousel() async {
        carouselCategories = (try? await RecipeService.shared.fetchCategoryCarousel()) ?? []
    }

    private func loadLocationStock(_ locationId: String) async {
        isLoadingStock = true
        defer { isLoadingStock = false }
        // On failure (network, 429, a pull-to-refresh that got cancelled) keep
        // what is on screen; an empty list read as "all stock is gone".
        if let fresh = try? await LocationService.shared.fetchLocationStock(id: locationId) {
            locationStock = fresh
        }
    }

    private func loadLocationRecipeStock(_ locationId: String) async {
        isLoadingRecipeStock = true
        defer { isLoadingRecipeStock = false }
        if let fresh = try? await LocationService.shared.fetchLocationRecipeStock(id: locationId) {
            locationRecipeStock = fresh
        }
    }

    /// Build the "Toate" view from every raw material's global stock. Using the
    /// raw-material list (not per-location MaterialStock) ensures materials added
    /// before any location existed — or never placed in one — still appear.
    private func loadCumulatedStock() async {
        isLoadingCumulated = true
        defer { isLoadingCumulated = false }

        var query = RawMaterialQuery()
        query.limit = 500
        async let materialsTask = StockService.shared.fetchRawMaterials(query: query)

        var assignedIds = Set<String>()
        var perLocation: [String: [Double]] = [:]
        var locationFailed = false
        await withTaskGroup(of: [LocationStockResponse]?.self) { group in
            for loc in locations {
                let locId = loc.id
                group.addTask { try? await LocationService.shared.fetchLocationStock(id: locId) }
            }
            for await stocks in group {
                guard let stocks else { locationFailed = true; continue }
                for s in stocks {
                    assignedIds.insert(s.rawMaterialId)
                    perLocation[s.rawMaterialId, default: []].append(s.quantity)
                }
            }
        }

        // A failed or cancelled refresh keeps the list on screen instead of
        // replacing it with nothing (owner: "la refresh lipsesc toate materialele").
        guard let materials = (try? await materialsTask)?.data, !locationFailed else { return }
        rawPerLocationQtyById = perLocation
        materialMetaById = Dictionary(materials.map { m in
            (m.id, MaterialMeta(minimumStock: m.minimumStock, discontinued: m.status == .DISCONTINUED))
        }, uniquingKeysWith: { first, _ in first })
        cumulatedStock = materials
            .map {
                // Total din suma per-locatie (exact), cu stockCount ca fallback
                // pentru materialele nealocate niciunei locatii.
                let locQtys = perLocation[$0.id]
                let quantity = locQtys.map { $0.reduce(0, +) } ?? Double($0.stockCount)
                return CumulatedStockItem(
                    rawMaterialId: $0.id,
                    title: $0.title,
                    category: $0.category,
                    unit: $0.unit,
                    quantity: quantity,
                    unassigned: !assignedIds.contains($0.id)
                )
            }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }

    /// Sum produced recipe stock across all locations (the "Toate" view for recipes).
    private func loadCumulatedRecipeStock() async {
        isLoadingCumulatedRecipe = true
        defer { isLoadingCumulatedRecipe = false }

        var byRecipe: [String: CumulatedRecipeStockItem] = [:]
        var perLocation: [String: [Double]] = [:]
        var recipeLocationFailed = false
        await withTaskGroup(of: [LocationRecipeStockResponse]?.self) { group in
            for loc in locations {
                let locId = loc.id
                group.addTask { try? await LocationService.shared.fetchLocationRecipeStock(id: locId) }
            }
            for await stocks in group {
                guard let stocks else { recipeLocationFailed = true; continue }
                for s in stocks {
                    perLocation[s.recipeId, default: []].append(s.quantity)
                    if var existing = byRecipe[s.recipeId] {
                        existing.quantity += s.quantity
                        byRecipe[s.recipeId] = existing
                    } else {
                        byRecipe[s.recipeId] = CumulatedRecipeStockItem(
                            recipeId: s.recipeId,
                            recipeName: s.recipeName,
                            recipeType: s.recipeType,
                            category: s.category,
                            unit: s.unit,
                            quantity: s.quantity
                        )
                    }
                }
            }
        }

        guard !recipeLocationFailed else { return }
        recipePerLocationQtyById = perLocation
        cumulatedRecipeStock = byRecipe.values
            .sorted { $0.recipeName.localizedCaseInsensitiveCompare($1.recipeName) == .orderedAscending }
    }
}

// MARK: - Recipe type stock labels

private extension RecipeType {
    var stockSectionLabel: String {
        switch self {
        case .SEMIPREPARAT: "Semipreparate"
        case .FINAL: "Produse finite"
        }
    }
}

// MARK: - Cumulated items

/// A material's stock summed across all locations (the "Toate" view).
struct CumulatedStockItem: Identifiable {
    let rawMaterialId: String
    let title: String
    let category: String?
    let unit: UnitType
    var quantity: Double
    var unassigned: Bool = false // not present in any location's stock
    var id: String { rawMaterialId }
}

/// A produced recipe's stock summed across all locations (the "Toate" view).
struct CumulatedRecipeStockItem: Identifiable {
    let recipeId: String
    let recipeName: String
    let recipeType: RecipeType
    let category: String?
    let unit: UnitType
    var quantity: Double
    var id: String { recipeId }
}

// MARK: - List data

/// One product line of the stock lists, already resolved to what the row
/// shows + where it navigates.
private struct StockListEntry: Identifiable {
    let id: String
    let route: Route
    let title: String
    let unit: UnitType
    let quantity: Double
    var subtitle: String? = nil
    var subtitleTone: AppTheme.Status.Kind? = nil
    var status: AppTheme.Status.Kind = .ready
}

private struct StockListSection: Identifiable {
    var id: String { "\(kind ?? "")/\(title)" }
    let title: String
    let entries: [StockListEntry]
    /// Super-category of the group (tints the pill header).
    var kind: String? = nil
}

#Preview("Stoc") {
    NavigationStack {
        StockOverviewView()
    }
    .environment(AppSchemeStore.shared)
}
