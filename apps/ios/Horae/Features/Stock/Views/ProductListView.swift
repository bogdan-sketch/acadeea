import SwiftUI

struct ProductListView: View {
    @State private var viewModel: ProductListViewModel
    @State private var showCategoryPicker = false
    /// Category groups the user folded (tap on the pill header).
    @State private var collapsedGroups: Set<String> = []
    @State private var bulkCategory = ""
    @State private var hasAppearedOnce = false
    private let isMisc: Bool

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    init(category: String? = nil) {
        self.isMisc = category == "__none__"
        _viewModel = State(initialValue: ProductListViewModel(category: category))
    }

    var body: some View {
        Group {
            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateView(title: "Niciun produs", systemImage: "gift")
            } else {
                List {
                    if !viewModel.hasPredefinedCategory {
                        // Dial-ul aprobat: doua placi (Semipreparate / Produse finite);
                        // produsele de dedesubt sunt grupate pe categorie.
                        VStack(spacing: AppTheme.Spacing.sm) {
                            KindDialView(
                                kinds: viewModel.kindCounts,
                                selection: Binding(
                                    get: { viewModel.selectedType.map { $0 == .SEMIPREPARAT ? "SEMIPREPARAT" : "PRODUS_FINIT" } },
                                    set: { newValue in
                                        viewModel.selectedType = newValue == "SEMIPREPARAT" ? .SEMIPREPARAT : newValue == "PRODUS_FINIT" ? .FINAL : nil
                                        viewModel.selectedCategory = nil
                                        Task { await viewModel.loadInitial() }
                                    }
                                )
                            )
                            // Categories of the chosen kind as chips; tap again to clear.
                            if viewModel.selectedType != nil {
                                CategoryChipCarousel(
                                    categories: viewModel.chipCategories,
                                    selection: Binding(
                                        get: { viewModel.selectedCategory },
                                        set: { newValue in
                                            viewModel.selectedCategory = newValue
                                            Task { await viewModel.loadInitial() }
                                        }
                                    )
                                )
                            }
                        }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    }

                    ForEach(viewModel.groupedItems, id: \.category) { group in
                        Section {
                            if !collapsedGroups.contains(group.category) {
                                ForEach(group.items) { item in
                                    if viewModel.isSelecting {
                                        selectableRow(item)
                                    } else {
                                        NavigationLink(value: Route.recipeStockDetail(id: item.id)) {
                                            RecipeStockRow(item: item, showCategoryWarning: isMisc)
                                        }
                                        .onLongPressGesture {
                                            viewModel.isSelecting = true
                                            viewModel.selectedIds.insert(item.id)
                                        }
                                    }
                                }
                            }
                        } header: {
                            CategoryPillHeader(
                                name: group.category, kind: group.kind, count: group.items.count,
                                isCollapsed: collapsedGroups.contains(group.category),
                                onToggle: {
                                    withAnimation(.snappy) {
                                        if collapsedGroups.contains(group.category) { collapsedGroups.remove(group.category) } else { collapsedGroups.insert(group.category) }
                                    }
                                }
                            )
                        }
                    }

                    if viewModel.isLoading {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.plain) // listele nu tinteaza textul randurilor
                .collapsedSearch(text: $viewModel.search, prompt: "Caută produse")
            }
        }
        .onChange(of: viewModel.search) {
            viewModel.searchChanged()
        }
        .task {
            if !viewModel.hasPredefinedCategory {
                await viewModel.loadCategories()
            }
            await viewModel.loadInitial()
        }
        .onAppear {
            // Refresh when returning from a detail (adjust/receive changed
            // stock there) — .task only runs on the first appearance.
            guard hasAppearedOnce else { hasAppearedOnce = true; return }
            Task { await viewModel.loadInitial() }
        }
        .errorAlert($viewModel.error)
        .toolbar {
            if viewModel.isSelecting {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anulează") { viewModel.exitSelection() }
                }
                ToolbarItem(placement: .principal) {
                    Text("\(viewModel.selectedIds.count) selectate")
                        .font(.headline)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if viewModel.isSelecting && !viewModel.selectedIds.isEmpty {
                bulkActionsBar
            }
        }
        .sheet(isPresented: $showCategoryPicker) {
            categoryPickerSheet
        }
    }

    // MARK: - Selectable Row

    @ViewBuilder
    private func selectableRow(_ item: RecipeStockResponse) -> some View {
        Button {
            viewModel.toggleSelection(item.id)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: viewModel.selectedIds.contains(item.id) ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(viewModel.selectedIds.contains(item.id) ? AppTheme.Colors.primary : .secondary)
                    .font(.title3)

                RecipeStockRow(item: item, showCategoryWarning: isMisc)
            }
            // .plain limiteaza tap-ul la continutul desenat.
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Bulk Actions Bar

    private var bulkActionsBar: some View {
        HStack(spacing: 16) {
            if permissions.can(.update, .Recipe) {
                Button {
                    showCategoryPicker = true
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: "folder")
                        Text("Categorie")
                            .font(.caption2)
                    }
                }
            }

            if permissions.can(.create, .StockTransfer) {
                NavigationLink(value: Route.transferCreate) {
                    VStack(spacing: 4) {
                        Image(systemName: "arrow.left.arrow.right")
                        Text("Transfer")
                            .font(.caption2)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.ultraThinMaterial)
    }

    // MARK: - Category Picker Sheet

    private var categoryPickerSheet: some View {
        NavigationStack {
            List {
                ForEach(viewModel.categories, id: \.self) { cat in
                    Button {
                        showCategoryPicker = false
                        Task { await viewModel.bulkSetCategory(cat) }
                    } label: {
                        Text(cat)
                            .foregroundStyle(Color.primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                }
            }
            .buttonStyle(.plain) // listele nu tinteaza textul randurilor
            .navigationTitle("Seteaza categorie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anulează") { showCategoryPicker = false }
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Category Chip

    @ViewBuilder
    private func categoryChip(_ cat: String?, label: String) -> some View {
        Button {
            viewModel.selectedCategory = viewModel.selectedCategory == cat ? nil : cat
            Task { await viewModel.loadInitial() }
        } label: {
            Text(label)
                .font(.caption.bold())
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.vertical, AppTheme.Spacing.xs)
                .background(viewModel.selectedCategory == cat ? Color.accentColor : Color(.secondarySystemFill))
                .foregroundStyle(viewModel.selectedCategory == cat ? .white : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
