import SwiftUI

/// Rețete — Fraunces header, Produse finale / Semipreparate segmented control,
/// category chips with counts (+ Schițe / Arhivate toggles), the web-style
/// card grid (`RecipeCardsRollout`), else a grid of photo cards (feature flag
/// `RecipePhotos.enabled` on) or Stoc-like rows grouped by category (OFF, the
/// default), and a FAB for a new recipe.
struct RecipeListView: View {
    @State private var viewModel = RecipeListViewModel()
    /// "Selectează" mode — multi-select + bulk delete.
    @State private var selection = BulkSelection()
    @State private var showSearch = false
    /// Collapsing head — hidden while the recipes scroll down.
    @State private var headVisible = true
    @State private var didSetInitialType = false

    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.routeNavigator) private var navigator

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }
    private var canBulk: Bool { permissions.can(.delete, .Recipe) || permissions.can(.update, .Recipe) }
    private var gutter: CGFloat { sizeClass == .regular ? AdaptiveLayout.gutter : 16 }

    var body: some View {
        // Collapsing head (title + search) over the pinned type switch and
        // category chips; only the recipes scroll — and pull to refresh.
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                header
                if showSearch || !viewModel.searchText.isEmpty {
                    HInlineSearchField(text: $viewModel.searchText, prompt: "Caută rețetă…") {
                        withAnimation(.snappy) { showSearch = false }
                    }
                    .padding(.horizontal, gutter)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .padding(.top, AppTheme.Spacing.sm)
            .padding(.bottom, 10)
            .autoCollapsible(headVisible)

            VStack(alignment: .leading, spacing: 10) {
                RecipeTypeSegmented(selection: viewModel.selectedType ?? .FINAL) { type in
                    viewModel.filterByType(type)
                }
                .padding(.horizontal, gutter)
                filterChips
            }
            .padding(.top, headVisible ? 0 : AppTheme.Spacing.sm)
            .padding(.bottom, 10)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    grid
                        .padding(.horizontal, gutter)
                }
                .padding(.top, 2)
                .padding(.bottom, 88)
            }
            .refreshable {
                await Task {
                    await viewModel.loadCategoryStats()
                    await viewModel.refresh()
                }.value
            }
            .autoHideOnScroll($headVisible)
        }
        .scrollDismissesKeyboard(.immediately)
        .background(AppTheme.Colors.appBackground.ignoresSafeArea())
        .overlay(alignment: .bottomTrailing) {
            if permissions.can(.create, .Recipe) && !selection.isActive {
                HFab(label: "Rețetă nouă") { navigator.push(.recipeCreate) }
                    .padding(.trailing, 18)
                    .padding(.bottom, 16)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: viewModel.searchText) {
            viewModel.searchChanged()
        }
        .task {
            // The segmented control has no "all" state: start on Produse finale.
            if !didSetInitialType, viewModel.selectedType == nil {
                didSetInitialType = true
                viewModel.selectedType = .FINAL
            }
            await viewModel.loadCategoryStats()
            await viewModel.loadRecipes(reset: true)
        }
        .errorAlert($viewModel.error)
        .bulkSelectBar(
            selection,
            allIds: viewModel.recipes.map(\.id),
            warning: BulkDeleteWarning.recipes,
            canDelete: permissions.can(.delete, .Recipe),
            actions: permissions.can(.update, .Recipe) ? BulkActionCatalog.recipes : [],
            onAction: { try await RecipeService.shared.bulkAction(ids: $0, action: $1, params: $2) },
            onPreview: { try await RecipeService.shared.bulkDeletePreview(ids: $0) },
            onDelete: { try await RecipeService.shared.bulkDelete(ids: $0) },
            onDone: {
                await viewModel.loadCategoryStats()
                await viewModel.loadRecipes(reset: true)
            }
        )
    }

    // MARK: - Header

    private var listTitle: String {
        if viewModel.showArchived { return "Arhivate" }
        if viewModel.showDrafts { return "Schițe" }
        return "Rețete"
    }

    private var eyebrow: String {
        let total = viewModel.categoryCounts.values.reduce(0, +)
        let kind = viewModel.selectedType == .SEMIPREPARAT ? "semipreparate" : "produse finale"
        return viewModel.showArchived || viewModel.showDrafts
            ? "\(total) \(kind) · Rețete" : "\(total) \(kind)"
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 8) {
            HScreenTitle(listTitle, eyebrow: eyebrow)
            HIconButton("magnifyingglass", label: "Caută rețetă") {
                withAnimation(.snappy) { showSearch.toggle() }
                if !showSearch { viewModel.searchText = "" }
            }
            if canBulk {
                HIconButton(
                    selection.isActive ? "checkmark" : "checkmark.circle",
                    label: selection.isActive ? "Gata cu selecția" : "Selectează mai multe rețete",
                    variant: selection.isActive ? .prominent : .standard
                ) {
                    if selection.isActive { selection.exit() } else { selection.enter() }
                }
            }
        }
        .padding(.horizontal, sizeClass == .regular ? AdaptiveLayout.gutter : 20)
    }

    // MARK: - Chips

    /// Recipes per chip — a parent counts its sub-categories.
    private func count(of category: CarouselCategory) -> Int {
        let own = viewModel.categoryCounts[category.name] ?? 0
        let children = viewModel.dialCategories
            .filter { $0.parentName == category.name }
            .reduce(0) { $0 + (viewModel.categoryCounts[$1.name] ?? 0) }
        return own + children
    }

    private var filterChips: some View {
        var seen = Set<String>()
        let cats = viewModel.dialCategories.filter {
            !$0.name.isEmpty && seen.insert($0.name).inserted && count(of: $0) > 0
        }
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(cats) { cat in
                    HChip(cat.name, count: count(of: cat), isSelected: viewModel.selectedCategory == cat.name) {
                        viewModel.filterByCategory(viewModel.selectedCategory == cat.name ? nil : cat.name)
                    }
                }
                if !cats.isEmpty {
                    Rectangle().fill(AppTheme.Colors.border).frame(width: 1, height: 22)
                        .accessibilityHidden(true)
                }
                HChip("Schițe", isSelected: viewModel.showDrafts) { viewModel.toggleDrafts() }
                    .help("Arată schițele — apasă din nou pentru rețetele active")
                HChip("Arhivate", isSelected: viewModel.showArchived) { viewModel.toggleArchived() }
                    .help("Arată rețetele arhivate — apasă din nou pentru cele active")
                if permissions.can(.manage, .Recipe) {
                    HQuickActionChip("Categorii", systemImage: "tag", help: "Gestionează categoriile",
                                     destination: .categoryManagement)
                }
            }
            .padding(.horizontal, gutter)
            .padding(.vertical, 2)
        }
    }

    // MARK: - Grid

    @ViewBuilder
    private var grid: some View {
        if viewModel.recipes.isEmpty && viewModel.isLoading {
            ProgressView().frame(maxWidth: .infinity, minHeight: 240)
        } else if viewModel.recipes.isEmpty {
            ContentUnavailableView(
                viewModel.showArchived ? "Nu există rețete arhivate"
                    : viewModel.showDrafts ? "Nu există schițe" : "Nu există rețete",
                systemImage: viewModel.showArchived ? "archivebox"
                    : viewModel.showDrafts ? "doc.badge.ellipsis" : "book")
            .frame(minHeight: 260)
        } else if RecipeCardsRollout.isEnabled(horizontalSizeClass: sizeClass) {
            // Web-style card grid — iPad everywhere, iPhone in Horae Test only.
            // Revert = `RecipeCardsRollout.isEnabled` → false (rows below return).
            RecipeCardGrid(recipes: viewModel.recipes, selection: selection) { recipe in
                if recipe.id == viewModel.recipes.last?.id {
                    Task { await viewModel.loadMore() }
                }
            }
            if viewModel.isLoading {
                ProgressView().frame(maxWidth: .infinity).padding()
            }
        } else if !RecipePhotos.enabled {
            RecipeRowsList(
                recipes: viewModel.recipes,
                categoryOrder: viewModel.dialCategories.map(\.name),
                kind: viewModel.selectedType == .SEMIPREPARAT ? "SEMIPREPARAT" : "PRODUS_FINIT",
                selection: selection
            ) { recipe in
                if recipe.id == viewModel.recipes.last?.id {
                    Task { await viewModel.loadMore() }
                }
            }
            if viewModel.isLoading {
                ProgressView().frame(maxWidth: .infinity).padding()
            }
        } else {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 160), spacing: 10, alignment: .top)],
                spacing: 10
            ) {
                ForEach(viewModel.recipes) { recipe in
                    card(recipe)
                        .onAppear {
                            if recipe.id == viewModel.recipes.last?.id {
                                Task { await viewModel.loadMore() }
                            }
                        }
                }
            }
            if viewModel.isLoading {
                ProgressView().frame(maxWidth: .infinity).padding()
            }
        }
    }

    @ViewBuilder
    private func card(_ recipe: RecipeResponse) -> some View {
        let tint = viewModel.categoryColorHex(recipe.category).flatMap { Color(hex: $0) }
        if selection.isActive {
            let isOn = selection.contains(recipe.id)
            Button { selection.toggle(recipe.id) } label: {
                RecipeCardView(recipe: recipe, tint: tint)
                    .overlay(alignment: .topLeading) {
                        Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                            .font(.title2)
                            .foregroundStyle(isOn ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryLabel)
                            .background(AppTheme.Colors.card, in: Circle())
                            .padding(8)
                            .accessibilityHidden(true)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isOn ? .isSelected : [])
            .accessibilityHint(isOn ? "Deselectează" : "Selectează")
        } else {
            NavigationLink(value: Route.recipeDetail(id: recipe.id)) {
                RecipeCardView(recipe: recipe, tint: tint)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Segmented

/// Produse finale / Semipreparate — the prototype's two-segment switch.
struct RecipeTypeSegmented: View {
    let selection: RecipeType
    let onSelect: (RecipeType) -> Void

    var body: some View {
        HStack(spacing: 2) {
            segment(.FINAL, "Produse finale")
            segment(.SEMIPREPARAT, "Semipreparate")
        }
        .padding(4)
        .background(AppTheme.Colors.border.opacity(0.7), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func segment(_ type: RecipeType, _ title: String) -> some View {
        let isOn = selection == type
        return Button {
            if !isOn { onSelect(type) }
        } label: {
            Text(title)
                .font(AppFont.body(14, weight: .bold))
                .foregroundStyle(isOn ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 36)
                .background {
                    if isOn {
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(AppTheme.Colors.card)
                            .shadow(color: .black.opacity(0.08), radius: 1.5, y: 1)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        .animation(.snappy(duration: 0.2), value: isOn)
    }
}

// MARK: - Card

/// Recipe card: photo (or category-tinted tile with the initial) + stock pill,
/// name, batch yield, price footer.
struct RecipeCardView: View {
    let recipe: RecipeResponse
    /// Category colour (from the carousel); nil = scheme primary wash.
    var tint: Color?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            hero
            VStack(alignment: .leading, spacing: 6) {
                Text(recipe.name)
                    .font(AppFont.body(14, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
                Text("\(recipe.unit.humanizedString(recipe.yieldQuantity)) / șarjă")
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .lineLimit(1)
                footer
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 12)
        }
        .background(AppTheme.Colors.card, in: shape)
        .clipShape(shape)
        .overlay(shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
        .contentShape(shape)
        .accessibilityElement(children: .combine)
    }

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 16, style: .continuous) }

    private var hero: some View {
        ZStack {
            Rectangle().fill((tint ?? AppTheme.Colors.primary).opacity(0.18))
            Text(recipe.name.trimmingCharacters(in: .whitespaces).prefix(1).uppercased())
                .font(AppFont.title(34))
                .foregroundStyle(AppTheme.Colors.label.opacity(0.5))
                .accessibilityHidden(true)
            if recipe.photoUrl != nil {
                RecipePhotoView(photoUrl: recipe.photoUrl, name: recipe.name, cornerRadius: 0)
            }
        }
        .frame(height: 96)
        .frame(maxWidth: .infinity)
        .clipped()
        .overlay(alignment: .topTrailing) {
            if let stock = recipe.stockCount {
                stockPill(stock).padding(8)
            }
        }
    }

    private func stockPill(_ stock: Double) -> some View {
        let tone: AppTheme.Status.Kind = stock <= 0 ? .danger : .ready
        return Text(stock <= 0 ? "fără stoc" : "\(recipe.unit.humanizedString(stock)) în stoc")
            .font(AppFont.body(11, weight: .bold))
            .lineLimit(1)
            .foregroundStyle(AppTheme.Status.fg(tone))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(AppTheme.Status.bg(tone), in: Capsule())
            // Opaque card under the wash: readable on photos too (web PILL_ON_HERO).
            .background(AppTheme.Colors.card, in: Capsule())
    }

    // Cost/Marjă (web card) not shown: GET /recipes has no cost and the
    // recipe-stock list returns calculatedCost = null (cost only via /:id/cost).
    private var footer: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("Preț")
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            Text(recipe.sellingPrice.map(\.ronFormatted) ?? "—")
                .font(AppFont.body(12, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 0)
            if recipe.isDraft {
                HStatusChip("Schiță", kind: .warning)
            } else if recipe.isArchived {
                HStatusChip("Arhivată", kind: .danger)
            }
        }
        .font(AppFont.body(12))
        .padding(.top, 6)
        .overlay(alignment: .top) {
            Rectangle().fill(AppTheme.Colors.border).frame(height: 1)
        }
    }
}

#Preview("Rețete") {
    NavigationStack {
        RecipeListView()
    }
    .environment(AppSchemeStore.shared)
}

#Preview("Segmented") {
    RecipeTypeSegmented(selection: .FINAL) { _ in }
        .padding()
        .background(AppTheme.Colors.appBackground)
}
