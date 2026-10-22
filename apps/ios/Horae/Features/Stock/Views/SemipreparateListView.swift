import SwiftUI

struct SemipreparateListView: View {
    @State private var viewModel = SemipreparateListViewModel()
    @State private var hasAppearedOnce = false

    var body: some View {
        Group {
            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateView(title: "Niciun semipreparat", systemImage: "tray")
            } else {
                List {
                    ForEach(viewModel.items) { item in
                        NavigationLink(value: Route.recipeStockDetail(id: item.id)) {
                            RecipeStockRow(item: item)
                        }
                        .onAppear {
                            if viewModel.items.isNearEnd(item) {
                                Task { await viewModel.loadMore() }
                            }
                        }
                    }

                    if viewModel.isLoading {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .searchable(text: $viewModel.search, prompt: "Caută semipreparate")
        .onChange(of: viewModel.search) {
            viewModel.searchChanged()
        }
        .task { await viewModel.loadInitial() }
        .onAppear {
            // Refresh when returning from a detail (adjust/receive changed
            // stock there) — .task only runs on the first appearance.
            guard hasAppearedOnce else { hasAppearedOnce = true; return }
            Task { await viewModel.loadInitial() }
        }
        .errorAlert($viewModel.error)
    }
}
