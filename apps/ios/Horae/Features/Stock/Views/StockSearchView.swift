import SwiftUI

/// Unified stock search across raw materials, produced recipes (semipreparate +
/// produse finite) and consumables. Debounced; each result row pushes the
/// matching detail screen. Reached from the "Cauta" quick action on the stock hub.
struct StockSearchView: View {
    @State private var searchText = ""
    @State private var rawMaterials: [RawMaterialResponse] = []
    @State private var recipeStock: [RecipeStockResponse] = []
    @State private var consumables: [ConsumableResponse] = []
    @State private var isLoading = false
    @State private var searchTask: Task<Void, Never>?

    private var hasQuery: Bool {
        !searchText.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var isEmpty: Bool {
        rawMaterials.isEmpty && recipeStock.isEmpty && consumables.isEmpty
    }

    var body: some View {
        List {
            if !rawMaterials.isEmpty {
                Section("Materii prime") {
                    ForEach(rawMaterials) { material in
                        NavigationLink(value: Route.rawMaterialDetail(id: material.id)) {
                            resultRow(
                                title: material.title,
                                subtitle: material.category,
                                stock: "\(material.unit.formatQty(material.stockCount))",
                                low: material.stockCount <= 0
                            )
                        }
                    }
                }
            }

            if !recipeStock.isEmpty {
                Section("Semipreparate și produse") {
                    ForEach(recipeStock) { item in
                        NavigationLink(value: Route.recipeStockDetail(id: item.id)) {
                            resultRow(
                                title: item.name,
                                subtitle: item.type.displayName,
                                stock: "\(item.unit.formatQty(item.stockCount))",
                                low: item.stockCount <= 0
                            )
                        }
                    }
                }
            }

            if !consumables.isEmpty {
                Section("Consumabile") {
                    ForEach(consumables) { consumable in
                        NavigationLink(value: Route.consumableDetail(id: consumable.id)) {
                            resultRow(
                                title: consumable.title,
                                subtitle: consumable.category,
                                stock: "\(consumable.stockCount.qtyFormatted) buc",
                                low: consumable.stockCount <= 0
                            )
                        }
                    }
                }
            }
        }
        .overlay { overlay }
        .navigationTitle("Caută în stoc")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Materie primă, produs, consumabil…")
        .onChange(of: searchText) { scheduleSearch() }
    }

    @ViewBuilder
    private var overlay: some View {
        if isLoading && isEmpty {
            ProgressView()
        } else if !isLoading && isEmpty {
            EmptyStateView(
                title: hasQuery ? "Niciun rezultat" : "Caută în stoc",
                systemImage: "magnifyingglass"
            )
        }
    }

    private func resultRow(title: String, subtitle: String?, stock: String, low: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(stock)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(low ? .red : .primary)
        }
    }

    /// Debounce keystrokes, then query all three stock kinds concurrently.
    private func scheduleSearch() {
        searchTask?.cancel()
        let query = searchText.trimmingCharacters(in: .whitespaces)

        guard !query.isEmpty else {
            rawMaterials = []
            recipeStock = []
            consumables = []
            isLoading = false
            return
        }

        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }

            isLoading = true
            defer { isLoading = false }

            async let raw = StockService.shared.fetchRawMaterials(
                query: { var q = RawMaterialQuery(); q.search = query; q.limit = 30; return q }()
            )
            async let recipes = StockService.shared.fetchRecipeStock(
                query: { var q = RecipeStockQuery(); q.search = query; q.limit = 30; return q }()
            )
            async let cons = StockService.shared.fetchConsumables(
                query: { var q = ConsumableQuery(); q.search = query; q.limit = 30; return q }()
            )

            let rawResult = (try? await raw)?.data ?? []
            let recipeResult = (try? await recipes)?.data ?? []
            let consResult = (try? await cons)?.data ?? []

            guard !Task.isCancelled else { return }
            rawMaterials = rawResult
            recipeStock = recipeResult
            consumables = consResult
        }
    }
}
