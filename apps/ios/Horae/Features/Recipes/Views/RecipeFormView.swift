import SwiftUI

struct RecipeFormView: View {
    @State private var viewModel: RecipeFormViewModel
    @State private var showDiscardConfirm = false
    @State private var showByproductSheet = false
    @Environment(\.dismiss) private var dismiss

    init(mode: RecipeFormMode) {
        self._viewModel = State(initialValue: RecipeFormViewModel(mode: mode))
    }

    private var isCreating: Bool {
        if case .create = viewModel.mode { return true }
        return false
    }

    var body: some View {
        Form {
            recipeInfoSection
            componentsSection
            byproductSection
            draftSection
        }
        .navigationTitle(viewModel.navigationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task { await viewModel.save() }
                } label: {
                    Image(systemName: "checkmark")
                }
                .disabled(!viewModel.isFormValid || viewModel.isSaving)
            }
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    if viewModel.isDirty { showDiscardConfirm = true } else { dismiss() }
                } label: {
                    Image(systemName: "xmark")
                }
            }
        }
        .overlay {
            if viewModel.isSaving {
                ProgressView("Se salveaza...")
            }
        }
        .task {
            // Load the recipe first so the category list matches its type, then
            // capture the baseline snapshot for unsaved-changes detection.
            await viewModel.loadIfEditing()
            await viewModel.loadCategories()
            viewModel.captureSnapshot()
        }
        .onChange(of: viewModel.recipeType) {
            // Final vs semipreparat use different category lists.
            Task { await viewModel.loadCategories() }
        }
        .onChange(of: viewModel.didSave) {
            if viewModel.didSave { dismiss() }
        }
        .unsavedChangesGuard(isDirty: viewModel.isDirty, isPresented: $showDiscardConfirm) {
            dismiss()
        }
        .errorAlert($viewModel.error)
    }

    // MARK: - Draft Section

    @ViewBuilder
    private var draftSection: some View {
        if isCreating {
            Section {
                Button {
                    Task { await viewModel.save(asDraft: true) }
                } label: {
                    Label("Salveaza ca schita", systemImage: "tray.and.arrow.down")
                        .foregroundStyle(Color.primary)
                }
                .disabled(!viewModel.isFormValid || viewModel.isSaving)
                .tutorialAnchor(id: "recipes.create.save")
            } footer: {
                Text("Schitele nu apar in listele obisnuite pana le publici.")
            }
        }
    }

    // MARK: - Info Section

    private var recipeInfoSection: some View {
        Section {
            FormField(label: "Nume", isRequired: true) {
                TextField("ex: Tort Zmeura", text: $viewModel.name)
            }

            FormField(label: "Tip preparat") {
                Picker("Tip", selection: $viewModel.recipeType) {
                    Text("Final").tag(RecipeType.FINAL)
                    Text("Semipreparat").tag(RecipeType.SEMIPREPARAT)
                }
                .pickerStyle(.segmented)
            }

            FormField(
                label: "Cantitate rezultată",
                isRequired: true,
                help: "Câte bucăți iese rețeta (ex: 50 macarons, 1 tort)."
            ) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    QuantityField(title: "Cantitate", value: $viewModel.yieldQuantity)
                    UnitSelector(unit: $viewModel.unit, title: "Unitate")
                }
            }

            FormField(
                label: "Cantitate per bucată",
                help: "Cat reprezinta o singura bucata, in unitatea aleasa (ex: 1 macaron = 0.02 kg). "
                    + "Total reteta = cantitate rezultata × cantitate per bucata. "
                    + "Lasa 1 daca lucrezi direct pe bucati."
            ) {
                QuantityField(title: "ex: 0,02", value: $viewModel.quantityPerPiece)
            }

            FormField(
                label: "Greutate produs finit (g)",
                help: "Greutatea intregii sarje dupa preparare (ex. pierderea de apa la coacere). "
                    + "Se foloseste pentru valorile nutritionale la 100 g. Lasa gol daca nu stii."
            ) {
                OptionalQuantityField(title: "ex: 850", value: $viewModel.finishedWeightGrams)
            }

            // Piece equivalent — only when this recipe is counted in bucăți, so it
            // can be used as an ingredient at a gramaj (1 bucată = N unit).
            if viewModel.unit == .BUCATI {
                FormField(
                    label: "O bucată reprezintă",
                    help: "Cat cantareste / contine o bucata (ex: 1 bucata = 2 kg). Permite folosirea "
                        + "semipreparatului la gramaj in alte retete. Lasa gol daca nu e cazul."
                ) {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        OptionalQuantityField(title: "ex: 2", value: $viewModel.pieceEquivalentQuantity)
                        UnitSelector(unit: $viewModel.pieceEquivalentUnit, title: "Unitate")
                    }
                }
            }

            FormField(label: "Categorie") {
                OptionalChoiceChips(
                    options: viewModel.availableCategories,
                    title: { $0 },
                    selection: $viewModel.category,
                    noneTitle: "Niciuna",
                    accessibilityLabel: "Categorie"
                )
            }

            FormField(label: "Pierderi estimate (%)", help: "Procent estimat de pierderi la producție.") {
                QuantityField(title: "ex: 5", value: $viewModel.estimatedLossPercent)
            }

            FormField(
                label: "Termen de valabilitate",
                help: "Cât rezistă produsul după producție. Determină data de expirare a stocului produs."
            ) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    ChoiceChips(
                        options: ShelfLifePreset.allCases,
                        title: \.label,
                        selection: $viewModel.shelfLifePreset,
                        accessibilityLabel: "Termen de valabilitate"
                    )

                    if viewModel.shelfLifePreset == .custom {
                        HStack {
                            TextField("ex: 4", text: $viewModel.shelfLifeCustomText)
                                .keyboardType(.numberPad)
                            Text("luni")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        } header: {
            Text("Informații rețetă").tutorialAnchor(id: "recipes.create.open")
        }
    }

    // MARK: - Byproduct Section

    /// "Rețeta lasă un byproduct" — the toggle opens the mini-form; the
    /// collected byproduct is created as a SEMIPREPARAT (isByproduct) right
    /// after the recipe saves. Existing byproducts are listed read-only.
    private var byproductSection: some View {
        Section {
            Toggle(
                "Rețeta lasă un byproduct",
                isOn: Binding(
                    get: {
                        !viewModel.existingByproducts.isEmpty || viewModel.pendingByproduct != nil
                    },
                    set: { on in
                        if on {
                            if viewModel.pendingByproduct == nil { showByproductSheet = true }
                        } else {
                            viewModel.pendingByproduct = nil
                        }
                    }
                )
            )
            .tint(AppTheme.Colors.primary)
            .tutorialAnchor(id: "recipes.create.byproduct")

            ForEach(viewModel.existingByproducts) { bp in
                HStack {
                    Text(bp.name)
                    Spacer()
                    Text("byproduct existent")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let pending = viewModel.pendingByproduct {
                Button {
                    showByproductSheet = true
                } label: {
                    HStack {
                        Text(pending.name)
                            .foregroundStyle(Color.primary)
                        Spacer()
                        Text(pending.unit.formatQty(pending.yieldQuantity))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Image(systemName: "pencil")
                            .font(.caption)
                            .foregroundStyle(AppTheme.Colors.primaryText)
                    }
                }
            }
        } header: {
            Text("Byproduct")
        } footer: {
            Text("Ce ramane dupa aceasta reteta (ex: resturi de blat). Se salveaza ca semipreparat marcat byproduct, odata cu reteta.")
        }
        .sheet(isPresented: $showByproductSheet) {
            NavigationStack {
                ByproductFormSheet(
                    initial: viewModel.pendingByproduct,
                    onConfirm: { pending in
                        viewModel.pendingByproduct = pending
                        showByproductSheet = false
                    },
                    onCancel: { showByproductSheet = false }
                )
            }
            .presentationDetents([.medium])
        }
    }

    // MARK: - Components Section

    private var componentsSection: some View {
        Section {
            ForEach(Array(viewModel.components.enumerated()), id: \.element.id) { index, _ in
                ComponentEditorView(
                    component: $viewModel.components[index],
                    onAddIngredient: { viewModel.addIngredient(to: index) },
                    onRemoveIngredient: { offsets in viewModel.removeIngredient(from: index, at: offsets) }
                )
            }
            .onDelete { viewModel.removeComponent(at: $0) }

            Button {
                viewModel.addComponent()
            } label: {
                HStack {
                    Image(systemName: "plus.circle")
                        .foregroundStyle(AppTheme.Colors.primaryText)
                    Text("Adauga componenta")
                        .foregroundStyle(Color.primary)
                }
            }
        } header: {
            Text("Componente & Ingrediente").tutorialAnchor(id: "recipes.create.ingredients")
        } footer: {
            Text("Grupeaza ingredientele pe componente (ex: Blat, Crema, Glazura)")
        }
    }

}

// MARK: - Component Editor

private struct ComponentEditorView: View {
    @Binding var component: ComponentFormData
    let onAddIngredient: () -> Void
    let onRemoveIngredient: (IndexSet) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            TextField("Nume componenta (ex: Blat, Crema)", text: $component.name)
                .font(.headline)

            // Explicit per-row delete: .onDelete (swipe) is a no-op here because
            // this ForEach lives in a VStack, not a List, so ingredients couldn't
            // be removed. A trash button works regardless of the container.
            ForEach(Array(component.ingredients.enumerated()), id: \.element.id) { index, _ in
                HStack(alignment: .top, spacing: AppTheme.Spacing.xs) {
                    IngredientRow(ingredient: $component.ingredients[index])
                    Button(role: .destructive) {
                        onRemoveIngredient(IndexSet(integer: index))
                    } label: {
                        Image(systemName: "trash")
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.borderless)
                }
            }

            // Don't let users stack empty rows — require the last added
            // ingredient to have a source selected before adding another.
            Button {
                onAddIngredient()
            } label: {
                HStack {
                    Image(systemName: "plus")
                        .foregroundStyle(AppTheme.Colors.primaryText)
                    Text("Adauga ingredient")
                        .foregroundStyle(Color.primary)
                }
                    .font(.caption)
            }
            .disabled(component.ingredients.contains { $0.name.isEmpty })
        }
        .padding(.vertical, AppTheme.Spacing.xs)
    }
}

// MARK: - Ingredient Row

private struct IngredientRow: View {
    @Binding var ingredient: IngredientFormItem
    @State private var showPicker = false
    @FocusState private var quantityFocused: Bool

    /// Recipes are written in small units — default solids to grams (and keep the
    /// other families to their small unit), rather than the material's stock unit.
    private func defaultRecipeUnit(for materialUnit: UnitType) -> UnitType {
        switch materialUnit.measure {
        case .solid: .GRAME
        case .liquid: .MILILITRI
        case .count: .BUCATI
        }
    }

    /// Move focus to the quantity field once the picker sheet has dismissed.
    private func focusQuantitySoon() {
        Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            quantityFocused = true
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                ingredientSourceButton
                Spacer()
                quantityFields
            }

            // Raw materials: pick any unit in the same measure family as the
            // material (the family is fixed, so the selector is locked to it).
            // Semipreparate keep the sub-recipe's yield unit (shown inline above).
            if !ingredient.name.isEmpty && !ingredient.isSemipreparat {
                UnitSelector(unit: $ingredient.unit, lockedMeasure: true)
            }

            if !ingredient.name.isEmpty {
                TextField("Preparare (optional, ex: cuburi, cernut)", text: $ingredient.prepMethod)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
        .sheet(isPresented: $showPicker) {
            NavigationStack {
                IngredientPickerView(
                    onSelectMaterial: { id, name, materialUnit in
                        ingredient.rawMaterialId = id
                        ingredient.semipreparatRecipeId = nil
                        ingredient.name = name
                        ingredient.unit = defaultRecipeUnit(for: materialUnit)
                        showPicker = false
                        focusQuantitySoon()
                    },
                    onSelectRecipe: { id, name, yieldUnit in
                        ingredient.semipreparatRecipeId = id
                        ingredient.rawMaterialId = nil
                        ingredient.name = name
                        // Use the semipreparat in the unit its recipe was made in
                        // (its yield unit) — no cross-family conversion, exact stock.
                        ingredient.unit = yieldUnit
                        showPicker = false
                        focusQuantitySoon()
                    },
                    onCancel: { showPicker = false }
                )
            }
        }
    }

    private var ingredientSourceButton: some View {
        Button {
            showPicker = true
        } label: {
            HStack(spacing: 4) {
                if ingredient.isSemipreparat {
                    Image(systemName: "book")
                        .font(.caption2)
                        .foregroundStyle(.purple)
                }
                Text(ingredient.name.isEmpty ? "Selecteaza ingredient" : ingredient.name)
                    .foregroundStyle(ingredient.name.isEmpty ? .secondary : .primary)
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var quantityFields: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            QuantityField(title: "Cant.", value: $ingredient.quantity, focusBinding: $quantityFocused)
                .frame(width: 60)
                .multilineTextAlignment(.trailing)

            // Semipreparate carry the sub-recipe's yield unit — fixed, shown
            // inline. Raw-material units are chosen via the locked UnitSelector
            // below the row (constrained to the material's measure family).
            Text(ingredient.unit.abbreviation)
                .foregroundStyle(.secondary)
                .frame(width: 56, alignment: .trailing)
        }
        .font(.subheadline)
    }
}

// MARK: - Unified Ingredient Picker

/// ONE searchable list over every pickable ingredient — materii prime,
/// semipreparate and byproducts in three sections (no source switcher).
struct IngredientPickerView: View {
    /// (id, name, stock unit) for a raw material.
    let onSelectMaterial: (String, String, UnitType) -> Void
    /// (id, name, yield unit) for a semipreparat/byproduct — the sub-recipe's
    /// yield unit is applied so it is always used in the unit it was made in.
    let onSelectRecipe: (String, String, UnitType) -> Void
    let onCancel: () -> Void

    @State private var searchText = ""
    @State private var materials: [RawMaterialResponse] = []
    @State private var recipes: [RecipeSummary] = []
    @State private var isLoading = false
    /// Crește la fiecare căutare — un răspuns sosit târziu pentru un text vechi
    /// nu mai suprascrie rezultatele căutării curente.
    @State private var searchGeneration = 0

    private var semipreparate: [RecipeSummary] { recipes.filter { !$0.isByproduct } }
    private var byproducts: [RecipeSummary] { recipes.filter { $0.isByproduct } }

    var body: some View {
        List {
            if !materials.isEmpty {
                Section("Materii prime") {
                    ForEach(materials) { material in
                        RawMaterialPickerRow(material: material) {
                            onSelectMaterial(material.id, material.title, material.unit)
                        }
                    }
                }
            }
            if !semipreparate.isEmpty {
                Section("Semipreparate") {
                    ForEach(semipreparate) { recipe in
                        SemipreparatPickerRow(recipe: recipe) {
                            onSelectRecipe(recipe.id, recipe.name, recipe.unit)
                        }
                    }
                }
            }
            if !byproducts.isEmpty {
                Section("Byproduct") {
                    ForEach(byproducts) { recipe in
                        SemipreparatPickerRow(recipe: recipe) {
                            onSelectRecipe(recipe.id, recipe.name, recipe.unit)
                        }
                    }
                }
            }
        }
        .buttonStyle(.plain) // listele nu tinteaza textul randurilor
        .overlay { pickerOverlay }
        .navigationTitle("Alege ingredient")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .searchable(text: $searchText, prompt: "Cauta ingredient...")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: { Image(systemName: "xmark") }
            }
        }
        .task { await search() }
        .onChange(of: searchText) { Task { await search() } }
    }

    @ViewBuilder
    private var pickerOverlay: some View {
        if isLoading && materials.isEmpty && recipes.isEmpty {
            ProgressView()
        } else if !isLoading && materials.isEmpty && recipes.isEmpty && !searchText.isEmpty {
            EmptyStateView(title: "Niciun ingredient gasit", systemImage: "magnifyingglass")
        }
    }

    private func search() async {
        searchGeneration += 1
        let generation = searchGeneration
        isLoading = true
        defer { if generation == searchGeneration { isLoading = false } }

        let text = searchText
        // Both lists load concurrently; a failure on one side leaves the other usable.
        async let materialsTask: [RawMaterialResponse] = {
            do {
                // The picker must see the org's ENTIRE raw-material stock —
                // a single capped page hid every material past the cap unless
                // it was searched by exact name. Walk all pages instead.
                var query = RawMaterialQuery()
                query.limit = 200
                query.search = text.isEmpty ? nil : text
                var all: [RawMaterialResponse] = []
                var page = 1
                while true {
                    query.page = page
                    let result = try await StockService.shared.fetchRawMaterials(query: query)
                    all += result.data
                    guard result.hasNextPage, !result.data.isEmpty, page < 50 else { break }
                    page += 1
                }
                // Discontinued (soft-deleted) materials are not valid ingredients.
                return all.filter { $0.status != .DISCONTINUED }
            } catch {
                return []
            }
        }()
        async let recipesTask: [RecipeSummary] = {
            do {
                var query = RecipeQuery()
                query.limit = 200
                query.search = text.isEmpty ? nil : text
                // Byproducts are semipreparate too — one fetch, split by flag.
                query.type = .SEMIPREPARAT
                var all: [RecipeResponse] = []
                var page = 1
                while true {
                    query.page = page
                    let result = try await RecipeService.shared.fetchRecipes(query: query)
                    all += result.data
                    guard result.hasNextPage, !result.data.isEmpty, page < 50 else { break }
                    page += 1
                }
                return all.map {
                    RecipeSummary(
                        id: $0.id,
                        name: $0.name,
                        type: $0.type,
                        unit: $0.unit,
                        yieldQuantity: $0.yieldQuantity,
                        isByproduct: $0.isByproduct
                    )
                }
            } catch {
                return []
            }
        }()

        let loadedMaterials = await materialsTask
        let loadedRecipes = await recipesTask
        // Un răspuns pentru un text de căutare mai vechi nu mai e relevant.
        guard generation == searchGeneration else { return }
        materials = loadedMaterials
        recipes = loadedRecipes
    }
}

private struct RawMaterialPickerRow: View {
    let material: RawMaterialResponse
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 2) {
                Text(material.title).font(.body).foregroundStyle(Color.primary)
                HStack {
                    if let producer = material.producer {
                        Text(producer).font(.caption).foregroundStyle(.secondary)
                    }
                    Text(material.unit.abbreviation).font(.caption).foregroundStyle(.secondary)
                }
            }
            // .plain pe List limiteaza tap-ul la continutul desenat — intinde
            // randul si fa toata suprafata tappable.
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
    }
}

private struct SemipreparatPickerRow: View {
    let recipe: RecipeSummary
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(recipe.name)
                .font(.body)
                .foregroundStyle(Color.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
    }
}

// MARK: - Byproduct Mini-Form

/// Collects the byproduct semipreparat (name + resulting quantity + unit);
/// the caller stores it as `pendingByproduct` and creates it after save.
private struct ByproductFormSheet: View {
    let initial: PendingByproduct?
    let onConfirm: (PendingByproduct) -> Void
    let onCancel: () -> Void

    @State private var name: String = ""
    @State private var quantity: Double = 0
    @State private var unit: UnitType = .GRAME

    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && quantity > 0
    }

    var body: some View {
        Form {
            FormField(label: "Nume", isRequired: true) {
                TextField("ex: Resturi de blat", text: $name)
            }
            FormField(label: "Cantitate rezultată", isRequired: true) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    QuantityField(title: "Cantitate", value: $quantity)
                    UnitSelector(unit: $unit, title: "Unitate")
                }
            }
        }
        .navigationTitle("Byproduct nou")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    onConfirm(PendingByproduct(name: name, unit: unit, yieldQuantity: quantity))
                } label: {
                    Image(systemName: "checkmark")
                }
                .disabled(!isValid)
            }
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: { Image(systemName: "xmark") }
            }
        }
        .onAppear {
            if let initial {
                name = initial.name
                quantity = initial.yieldQuantity
                unit = initial.unit
            }
        }
    }
}

#Preview {
    NavigationStack {
        RecipeFormView(mode: .create)
    }
}
