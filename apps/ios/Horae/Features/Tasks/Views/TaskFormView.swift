import SwiftUI

struct TaskFormView: View {
    @State private var viewModel: TaskFormViewModel
    @State private var showDiscardConfirm = false
    @Environment(\.dismiss) private var dismiss

    init(mode: TaskFormMode, preselectedRecipeId: String? = nil) {
        self._viewModel = State(initialValue: TaskFormViewModel(mode: mode, preselectedRecipeId: preselectedRecipeId))
    }

    var body: some View {
        Form {
            // Batch mode is create-only; single product stays the default.
            if !viewModel.isEditing {
                Section {
                    Picker("Mod", selection: $viewModel.isMultiMode) {
                        Text("Un produs").tag(false)
                        Text("Mai multe produse").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .accessibilityLabel("Mod de creare")
                    .tutorialAnchor(id: "tasks.create.mode")
                }
            }

            if viewModel.isMultiMode {
                multiProductsSection
                multiOptionsSection
            }

            Section {
                if !viewModel.isMultiMode {
                    // Nume custom — gol = numele retetei.
                    FormField(label: "Nume task", help: "Opțional. Gol = numele rețetei.") {
                        TextField("ex. Tort nuntă Popescu", text: $viewModel.title)
                            .textInputAutocapitalization(.sentences)
                    }

                    // Recipe picker — search by name
                    FormField(label: "Rețetă", isRequired: true) {
                        Button {
                            viewModel.showRecipePicker = true
                        } label: {
                            HStack {
                                Text(viewModel.selectedRecipeName ?? "Selectează rețeta")
                                    .foregroundStyle(viewModel.selectedRecipeName != nil ? .primary : .secondary)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .tutorialAnchor(id: "tasks.create.selectRecipe")

                    FormField(label: "Cantitate", isRequired: true) {
                        HStack {
                            TextField("Cantitate", value: $viewModel.targetQuantity, format: .number)
                                .keyboardType(.decimalPad)
                                .onChange(of: viewModel.targetQuantity) {
                                    viewModel.recomputeStock()
                                }

                            // Unit is fixed to the recipe's unit — the backend scales
                            // production by targetQuantity / recipe yield in that unit,
                            // so a mismatch would break the scale factor.
                            Text(viewModel.targetUnit.abbreviation)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .tutorialAnchor(id: "tasks.create.quantity")
                }

                // Production location — defaults to the laborator when there is one.
                FormField(label: "Locație producție", help: "Stocul se ia și produsul finit intră aici.") {
                    if viewModel.availableLocations.isEmpty {
                        Text("Se încarcă locațiile…")
                            .foregroundStyle(.secondary)
                    } else {
                        ChoiceChips(
                            options: viewModel.availableLocations.map(\.id),
                            title: { id in viewModel.availableLocations.first { $0.id == id }?.name ?? "" },
                            selection: Binding(
                                get: { viewModel.locationId ?? "" },
                                set: { viewModel.selectLocation(id: $0) }
                            ),
                            accessibilityLabel: "Locație producție"
                        )
                    }
                }
                .tutorialAnchor(id: "tasks.create.location")
            } header: {
                Text(viewModel.isMultiMode ? "Detalii comune" : "Detalii task")
            } footer: {
                if viewModel.isMultiMode {
                    Text("Locația, prioritatea, datele și nota se aplică tuturor taskurilor create.")
                }
            }

            // Live stock check — warns when the requested quantity exceeds stock.
            // Single-product only: the batch endpoint creates every task in one
            // shot, and a short task is allowed (it just can't start).
            if !viewModel.isMultiMode, !viewModel.recipeId.isEmpty {
                Section {
                    if viewModel.isCheckingStock {
                        HStack(spacing: AppTheme.Spacing.sm) {
                            ProgressView()
                            Text("Verific stocul…")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    } else if viewModel.hasStockShortage {
                        ForEach(viewModel.insufficientMaterials) { req in
                            HStack(alignment: .firstTextBaseline) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(AppTheme.Colors.destructive)
                                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                                    Text(req.title)
                                        .font(.subheadline.weight(.medium))
                                    Text("Necesar \(req.display(req.needed)) · disponibil \(req.display(req.available))")
                                        .font(.caption)
                                        .foregroundStyle(AppTheme.Colors.destructive)
                                }
                            }
                        }
                    } else if !viewModel.materialRequirements.isEmpty {
                        Label("Stoc suficient pentru cantitatea cerută", systemImage: "checkmark.circle.fill")
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.Colors.success)
                    }
                } header: {
                    Label("Verificare stoc", systemImage: "tray.full")
                } footer: {
                    if viewModel.hasStockShortage {
                        Text("Poți crea taskul, dar nu va putea porni până nu ai destul stoc.")
                    }
                }
            }

            Section("Prioritate") {
                PriorityPicker(selection: $viewModel.priority)
            }

            // Cine vede taskul in afara administratorilor (ei vad tot).
            Section {
                ChoiceChips(
                    options: TaskVisibility.allCases,
                    title: \.chipLabel,
                    selection: $viewModel.visibility,
                    accessibilityLabel: "Cine vede taskul"
                )

                if viewModel.visibility == .SELECTED {
                    ForEach(viewModel.visibleTo.sorted(by: { $0.value < $1.value }), id: \.key) { id, name in
                        HStack {
                            Text(name.isEmpty ? "Persoană" : name)
                            Spacer()
                            Button {
                                viewModel.toggleViewer(id: id, name: name)
                            } label: {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                                    .frame(width: 44, height: 44)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Scoate \(name.isEmpty ? "persoana" : name)")
                        }
                    }
                    Button {
                        viewModel.showViewerPicker = true
                    } label: {
                        Label("Adaugă persoană", systemImage: "person.badge.plus")
                    }
                }
            } header: {
                Text("Vizibilitate")
            } footer: {
                Text(viewModel.visibility == .SELECTED
                     ? "Persoanele alese și cel alocat. Administratorii văd toate taskurile."
                     : "Administratorii văd toate taskurile indiferent de setare.")
            }

            Section("Opțional") {
                FormField(label: "Data planificare", help: "Când planifici să începi producția.") {
                    HStack {
                        DatePicker(
                            "Planificare",
                            selection: Binding(
                                get: { viewModel.plannedDate ?? Date() },
                                set: { viewModel.plannedDate = $0 }
                            ),
                            displayedComponents: [.date] // doar data — ora nu e relevanta nicaieri in aplicatie
                        )
                        .labelsHidden()
                        .environment(\.locale, RoDate.locale)
                        .environment(\.calendar, RoDate.calendar)

                        if viewModel.plannedDate != nil {
                            Button("Șterge") {
                                viewModel.plannedDate = nil
                            }
                            .foregroundStyle(AppTheme.Colors.destructive)
                        }
                    }
                }

                FormField(label: "Termen limită", help: "Când trebuie predat la client.") {
                    HStack {
                        DatePicker(
                            "Termen",
                            selection: Binding(
                                get: { viewModel.dueDate ?? Date() },
                                set: { viewModel.dueDate = $0 }
                            ),
                            displayedComponents: [.date] // doar data — ora nu e relevanta nicaieri in aplicatie
                        )
                        .labelsHidden()
                        .environment(\.locale, RoDate.locale)
                        .environment(\.calendar, RoDate.calendar)

                        if viewModel.dueDate != nil {
                            Button("Șterge") {
                                viewModel.dueDate = nil
                            }
                            .foregroundStyle(AppTheme.Colors.destructive)
                        }
                    }
                }
                .tutorialAnchor(id: "tasks.create.dates")

                FormField(label: "Note") {
                    TextEditor(text: $viewModel.notes)
                        .frame(minHeight: 80)
                }

                // Assignee picker — search by name
                FormField(label: "Alocat la") {
                    Button {
                        viewModel.showUserPicker = true
                    } label: {
                        HStack {
                            Text(viewModel.selectedUserName ?? "Selectează persoana")
                                .foregroundStyle(viewModel.selectedUserName != nil ? .primary : .secondary)
                            Spacer()
                            if viewModel.assignedToId != nil {
                                Button {
                                    viewModel.assignedToId = nil
                                    viewModel.selectedUserName = nil
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.secondary)
                                        .frame(width: 44, height: 44)
                                        .contentShape(Rectangle())
                                }
                                .accessibilityLabel("Șterge persoana alocată")
                            }
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
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
                .accessibilityLabel("Salvează")
                .disabled(!viewModel.isFormValid || viewModel.isSaving)
            }

            ToolbarItem(placement: .cancellationAction) {
                Button {
                    if viewModel.isDirty { showDiscardConfirm = true } else { dismiss() }
                } label: {
                    Image(systemName: "xmark")
                }
                .accessibilityLabel("Renunță")
            }
        }
        .overlay {
            if viewModel.isSaving {
                ProgressView("Se salvează…")
            }
        }
        .sheet(isPresented: $viewModel.showRecipePicker) {
            NavigationStack {
                RecipePickerView(
                    currentId: viewModel.recipeId,
                    onSelect: { id, name, unit, yieldQuantity in
                        viewModel.selectRecipe(id: id, name: name, unit: unit, yieldQuantity: yieldQuantity)
                        viewModel.showRecipePicker = false
                    },
                    onCancel: { viewModel.showRecipePicker = false }
                )
            }
        }
        // Per-row recipe picker for the batch mode. A plain bool + row index
        // (as in BatchReceiveView) — a sheet re-render must not lose the row.
        .sheet(isPresented: Binding(
            get: { viewModel.multiPickerRow != nil },
            set: { if !$0 { viewModel.multiPickerRow = nil } }
        )) {
            NavigationStack {
                RecipePickerView(
                    currentId: viewModel.multiPickerRow.flatMap {
                        viewModel.multiItems.indices.contains($0) ? viewModel.multiItems[$0].recipeId : nil
                    } ?? "",
                    onSelect: { id, name, unit, yieldQuantity in
                        if let row = viewModel.multiPickerRow {
                            viewModel.selectMultiRecipe(row: row, id: id, name: name, unit: unit, yieldQuantity: yieldQuantity)
                        }
                        viewModel.multiPickerRow = nil
                    },
                    onCancel: { viewModel.multiPickerRow = nil }
                )
            }
        }
        .sheet(isPresented: $viewModel.showUserPicker) {
            NavigationStack {
                UserPickerView(
                    currentId: viewModel.assignedToId ?? "",
                    onSelect: { id, name in
                        viewModel.assignedToId = id
                        viewModel.selectedUserName = name
                        viewModel.showUserPicker = false
                    },
                    onCancel: { viewModel.showUserPicker = false }
                )
            }
        }
        .sheet(isPresented: $viewModel.showViewerPicker) {
            // Acelasi picker, dar fiecare tap adauga/scoate persoana din lista.
            NavigationStack {
                UserPickerView(
                    currentId: "",
                    selectedIds: Set(viewModel.visibleTo.keys),
                    onSelect: { id, name in viewModel.toggleViewer(id: id, name: name) },
                    onCancel: { viewModel.showViewerPicker = false }
                )
            }
        }
        .task {
            await viewModel.loadIfEditing()
            await viewModel.loadPreselectedRecipe()
            await viewModel.loadLocations()
            viewModel.captureSnapshot()
        }
        .onChange(of: viewModel.didSave) {
            if viewModel.didSave { dismiss() }
        }
        .unsavedChangesGuard(isDirty: viewModel.isDirty, isPresented: $showDiscardConfirm) {
            dismiss()
        }
        .errorAlert($viewModel.error)
    }

    // MARK: - Batch mode sections

    /// One row per recipe + quantity; the unit follows the picked recipe.
    private var multiProductsSection: some View {
        Section {
            ForEach(Array(viewModel.multiItems.enumerated()), id: \.element.id) { index, item in
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Button {
                        viewModel.multiPickerRow = index
                    } label: {
                        HStack {
                            Text(item.recipeName ?? "Selectează rețeta")
                                .foregroundStyle(item.recipeName != nil ? Color.primary : .secondary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Rețeta produsului \(index + 1)")

                    HStack {
                        TextField("Cantitate", text: $viewModel.multiItems[index].quantity)
                            .keyboardType(.decimalPad)
                            .accessibilityLabel("Cantitate produs \(index + 1)")
                        // Unitatea vine din reteta — scalarea din backend
                        // se face fata de randamentul retetei in acea unitate.
                        Text(item.unit.abbreviation)
                            .foregroundStyle(.secondary)
                    }

                    if viewModel.multiItems.count > 1 {
                        Button("Șterge produsul", role: .destructive) {
                            viewModel.removeMultiItem(id: item.id)
                        }
                        .font(.subheadline)
                    }
                }
                .padding(.vertical, AppTheme.Spacing.xxs)
            }

            Button {
                viewModel.addMultiItem()
            } label: {
                HStack {
                    Image(systemName: "plus.circle.fill")
                        .foregroundStyle(AppTheme.Colors.primaryText)
                    Text("Adaugă produs")
                        .foregroundStyle(Color.primary)
                }
                .contentShape(Rectangle())
            }
        } header: {
            Text("Produse").tutorialAnchor(id: "tasks.multi.rows")
        } footer: {
            Text("Se creează câte un task pentru fiecare produs din listă.")
        }
    }

    private var multiOptionsSection: some View {
        Section {
            FormField(label: "Nume grup (opțional)", help: "Numele familiei de taskuri, ex. „Comandă botez”.") {
                TextField("Nume grup", text: $viewModel.groupLabel)
            }

            Toggle("Creează și taskuri pentru semipreparate", isOn: $viewModel.includeSemipreparate)
                .tutorialAnchor(id: "tasks.multi.family")
        } footer: {
            if viewModel.includeSemipreparate {
                Text("Fiecare semipreparat din rețetele alese primește task propriu, cu cantitatea scalată.")
            }
        }
    }
}

// MARK: - Priority Picker (0-5 bullets)

struct PriorityPicker: View {
    @Binding var selection: Int

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("Nivel: \(selection)")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: AppTheme.Spacing.md) {
                ForEach(0...5, id: \.self) { level in
                    Button {
                        selection = level
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: level <= selection && selection > 0
                                  ? "circle.fill" : "circle")
                                .font(.title2)
                                .foregroundStyle(priorityColor(level))
                            Text("\(level)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func priorityColor(_ level: Int) -> Color {
        if level == 0 { return .gray }
        if selection == 0 { return .gray }
        if level > selection { return .gray }
        switch selection {
        case 1: return .blue
        case 2: return .green
        case 3: return .yellow
        case 4: return .orange
        case 5: return .red
        default: return .gray
        }
    }
}

// MARK: - Recipe Picker

struct RecipePickerView: View {
    let currentId: String
    let onSelect: (String, String, UnitType, Double) -> Void
    let onCancel: () -> Void

    @State private var searchText = ""
    @State private var recipes: [RecipeSummary] = []
    @State private var isLoading = false
    @State private var loadFailed = false

    var body: some View {
        List {
            ForEach(recipes) { recipe in
                RecipePickerRow(
                    recipe: recipe,
                    isSelected: currentId == recipe.id,
                    onTap: { onSelect(recipe.id, recipe.name, recipe.unit, recipe.yieldQuantity) }
                )
            }
        }
        .buttonStyle(.plain) // listele nu tinteaza textul randurilor
        .overlay { recipeOverlay }
        .navigationTitle("Selectează rețeta")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .searchable(text: $searchText, prompt: "Caută după nume…")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: { Image(systemName: "xmark") }
                    .accessibilityLabel("Închide")
            }
        }
        .task { await search() }
        .onChange(of: searchText) {
            Task { await search() }
        }
    }

    @ViewBuilder
    private var recipeOverlay: some View {
        if isLoading && recipes.isEmpty {
            ProgressView()
        } else if !isLoading && recipes.isEmpty {
            // Fara stare goala tacuta: spune explicit ce s-a intamplat, ca un
            // esec de incarcare sa nu arate ca "nu exista retete".
            if loadFailed {
                EmptyStateView(
                    title: "Rețetele nu au putut fi încărcate",
                    systemImage: "exclamationmark.triangle"
                )
            } else if searchText.isEmpty {
                EmptyStateView(title: "Nicio rețetă disponibilă", systemImage: "doc.text")
            } else {
                EmptyStateView(title: "Nicio rețetă găsită", systemImage: "magnifyingglass")
            }
        }
    }

    private func search() async {
        isLoading = true
        defer { isLoading = false }
        do {
            recipes = try await RecipeService.shared.searchRecipes(name: searchText)
            loadFailed = false
        } catch {
            recipes = []
            loadFailed = true
        }
    }
}

private struct RecipePickerRow: View {
    let recipe: RecipeSummary
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                VStack(alignment: .leading) {
                    // .primary explicit — un Text nestilat intr-un Button de List
                    // preia tint-ul de accent (titluri turcoaz, greu de citit).
                    Text(recipe.name)
                        .font(.body)
                        .foregroundStyle(Color.primary)
                    Text(recipe.type.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.tint)
                }
            }
            // .plain pe List limiteaza tap-ul la continutul desenat — fara
            // contentShape, golul din mijloc si zona checkmark-ului mor.
            .contentShape(Rectangle())
        }
    }
}

// MARK: - User Picker

struct UserPickerView: View {
    let currentId: String
    /// Multi-select mode (viewers): these rows show a checkmark, the sheet stays open.
    var selectedIds: Set<String> = []
    let onSelect: (String, String) -> Void
    let onCancel: () -> Void

    @State private var searchText = ""
    @State private var users: [UserSummary] = []
    @State private var isLoading = false

    var body: some View {
        List {
            ForEach(users) { user in
                UserPickerRow(
                    user: user,
                    isSelected: currentId == user.id || selectedIds.contains(user.id),
                    onTap: { onSelect(user.id, user.fullName) }
                )
            }
        }
        .buttonStyle(.plain) // listele nu tinteaza textul randurilor
        .overlay {
            if isLoading && users.isEmpty {
                ProgressView()
            }
        }
        .navigationTitle("Selectează persoana")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .searchable(text: $searchText, prompt: "Caută după nume…")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: { Image(systemName: "xmark") }
                    .accessibilityLabel("Închide")
            }
        }
        .task { await search() }
        .onChange(of: searchText) {
            Task { await search() }
        }
    }

    private func search() async {
        isLoading = true
        defer { isLoading = false }
        do {
            users = try await UserService.shared.searchUsers(name: searchText)
        } catch {
            users = []
        }
    }
}

private struct UserPickerRow: View {
    let user: UserSummary
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                VStack(alignment: .leading) {
                    Text(user.fullName)
                        .font(.body)
                        .foregroundStyle(Color.primary)
                    Text(user.roleName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.tint)
                }
            }
            .contentShape(Rectangle())
        }
    }
}

// MARK: - User models for picker

struct UserSummary: Identifiable, Sendable {
    let id: String
    let firstName: String
    let lastName: String
    let roleName: String

    var fullName: String { "\(firstName) \(lastName)" }
}

#Preview {
    NavigationStack {
        TaskFormView(mode: .create)
    }
}
