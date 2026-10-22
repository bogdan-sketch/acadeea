import SwiftUI

/// Category management built on the DYNAMIC super-category model.
///
/// TOP: a horizontally scrollable selector of super-categories (each tinted with its
/// own colour) loaded from `fetchSuperCategories()`. The user can add their own supers;
/// the 3 originals are `isSystem` (recolour only). Selecting a super loads its flat
/// sub-categories below. A "+" in the nav bar opens a clean Super / Sub choice sheet.
struct CategoryManagementView: View {
    // MARK: - State

    @State private var supers: [SuperCategory] = []
    @State private var selectedKind: String?

    @State private var categories: [CategoryConfig] = []

    @State private var isLoadingSupers = true
    @State private var isLoadingCategories = false
    @State private var error: String?

    // Flows
    @State private var showCreateSheet = false
    @State private var showReorderSheet = false
    @State private var showEditSuperSheet = false

    private var canManageRecipes: Bool {
        AuthManager.shared.permissionManager.can(.manage, .Recipe)
    }
    @State private var editingCategory: CategoryConfig?
    @State private var categoryToDelete: CategoryConfig?
    @State private var superToDelete: SuperCategory?
    @State private var deletingCategory: String?

    // MARK: - Derived

    private var selectedSuper: SuperCategory? {
        supers.first { $0.kind == selectedKind }
    }

    private var superColorHex: String? { selectedSuper?.color }
    private var superColor: Color { AppTheme.Colors.category(hex: superColorHex) }

    private var sortedCategories: [CategoryConfig] {
        categories.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    // MARK: - Body

    var body: some View {
        List {
            superSelectorSection

            if let selectedSuper {
                superHeaderSection(selectedSuper)
                subcategoriesContent
            } else if !isLoadingSupers {
                Section {
                    ContentUnavailableView(
                        "Nicio super-categorie",
                        systemImage: "square.stack.3d.up",
                        description: Text("Adaugă prima super-categorie cu butonul +.")
                    )
                    .listRowBackground(Color.clear)
                }
            }
        }
        .navigationTitle("Categorii")
        .toolbar {
            if canManageRecipes {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showReorderSheet = true
                    } label: {
                        Label("Reordonează", systemImage: "arrow.up.arrow.down")
                    }
                    .disabled(supers.isEmpty)
                    .accessibilityLabel("Reordonează categoriile")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCreateSheet = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Adaugă categorie")
            }
        }
        .task { await loadSupers(selectFirst: true) }
        .refreshable { await Task { await loadSupers() }.value }
        .sheet(isPresented: $showCreateSheet) {
            CreateCategorySheet(
                selectedSuper: selectedSuper,
                onCreatedSuper: { newSupers, newKind in
                    supers = newSupers
                    if let newKind { selectedKind = newKind }
                    await loadCategories()
                },
                onCreatedSub: {
                    await loadCategories()
                }
            )
        }
        .sheet(isPresented: $showReorderSheet) {
            CategoryReorderView { didReorder in
                if didReorder {
                    Task { await loadSupers() }
                }
            }
        }
        .sheet(isPresented: $showEditSuperSheet) {
            if let selectedSuper {
                EditSuperCategorySheet(superCategory: selectedSuper) { updated in
                    supers = updated
                }
            }
        }
        .sheet(item: $editingCategory) { cat in
            RenameCategorySheet(category: cat, kind: cat.kindForRename(selectedKind), superColorHex: superColorHex) {
                await loadCategories()
            }
        }
        .alert("Eroare", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
        .alert(
            "Șterge subcategoria?",
            isPresented: Binding(get: { categoryToDelete != nil }, set: { if !$0 { categoryToDelete = nil } })
        ) {
            Button("Șterge", role: .destructive) {
                if let cat = categoryToDelete { removeCategory(cat.name) }
                categoryToDelete = nil
            }
            Button("Anulează", role: .cancel) { categoryToDelete = nil }
        } message: {
            Text("Subcategoria „\(categoryToDelete?.name ?? "")” va fi eliminata din tot ce o folosește.")
        }
        .alert(
            "Șterge super-categoria?",
            isPresented: Binding(get: { superToDelete != nil }, set: { if !$0 { superToDelete = nil } })
        ) {
            Button("Șterge", role: .destructive) {
                if let s = superToDelete { deleteSuper(s) }
                superToDelete = nil
            }
            Button("Anulează", role: .cancel) { superToDelete = nil }
        } message: {
            Text("„\(superToDelete?.name ?? "")” și toate subcategoriile ei vor fi eliminate din tot ce le folosește.")
        }
    }

    // MARK: - Super selector (dynamic, horizontally scrollable)

    @ViewBuilder
    private var superSelectorSection: some View {
        Section {
            if isLoadingSupers && supers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            } else {
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: AppTheme.Spacing.sm) {
                            ForEach(supers) { sup in
                                SuperChip(
                                    superCategory: sup,
                                    isSelected: sup.kind == selectedKind
                                ) {
                                    withAnimation(.spring(.snappy)) { selectedKind = sup.kind }
                                    Task { await loadCategories() }
                                }
                                .id(sup.kind)
                            }
                        }
                        .padding(.vertical, AppTheme.Spacing.xs)
                    }
                    .onChange(of: selectedKind) { _, newValue in
                        if let newValue {
                            withAnimation(.spring(.snappy)) {
                                proxy.scrollTo(newValue, anchor: .center)
                            }
                        }
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: AppTheme.Spacing.xs, leading: AppTheme.Spacing.lg, bottom: AppTheme.Spacing.sm, trailing: AppTheme.Spacing.lg))
                .sensoryFeedback(.selection, trigger: selectedKind)
            }
        } footer: {
            Text("Alege o super-categorie. Atinge + pentru a adăuga o super-categorie sau o subcategorie.")
        }
    }

    // MARK: - Selected super header (edit / delete affordances)

    @ViewBuilder
    private func superHeaderSection(_ sup: SuperCategory) -> some View {
        Section {
            HStack(spacing: AppTheme.Spacing.md) {
                ColorSwatch(color: superColor, size: 30)

                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    HStack(spacing: AppTheme.Spacing.xs) {
                        Text(sup.name)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        if sup.isSystem {
                            SystemBadge()
                        }
                    }
                    Text(sup.isSystem ? "Super-categorie de sistem" : "Super-categorie")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button {
                    showEditSuperSheet = true
                } label: {
                    Image(systemName: sup.isSystem ? "paintpalette" : "pencil")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(superColor)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(sup.isSystem ? "Schimbă culoarea \(sup.name)" : "Editează \(sup.name)")
            }
            .listRowBackground(superColor.opacity(0.08))
        } footer: {
            if sup.isSystem {
                Text("Categorie de sistem: poți schimba doar culoarea.")
            } else {
                Text("Toate subcategoriile de mai jos folosesc culoarea acestei super-categorii.")
            }
        }
    }

    // MARK: - Subcategories list

    @ViewBuilder
    private var subcategoriesContent: some View {
        if isLoadingCategories {
            Section {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            }
        } else if categories.isEmpty {
            Section {
                ContentUnavailableView(
                    "Nicio subcategorie",
                    systemImage: "folder.badge.plus",
                    description: Text("Adaugă prima subcategorie pentru „\(selectedSuper?.name ?? "")” cu butonul +.")
                )
                .listRowBackground(Color.clear)
            }
        } else {
            Section {
                ForEach(sortedCategories) { cat in
                    subcategoryRow(cat)
                }
            } header: {
                HStack(spacing: AppTheme.Spacing.sm) {
                    Circle()
                        .fill(superColor)
                        .frame(width: 8, height: 8)
                    Text("Subcategorii")
                }
            } footer: {
                Text("Glisează pentru a redenumi sau șterge. Categoriile de sistem sunt blocate.")
            }
        }
    }

    @ViewBuilder
    private func subcategoryRow(_ cat: CategoryConfig) -> some View {
        HStack(spacing: AppTheme.Spacing.md) {
            Circle()
                .fill(superColor)
                .frame(width: 10, height: 10)
                .accessibilityHidden(true)

            Text(cat.name)
                .font(.body)

            Spacer()

            if cat.isSystem {
                SystemBadge()
            }

            if deletingCategory == cat.name {
                ProgressView()
            }
        }
        .listRowBackground(superColor.opacity(0.06))
        .contentShape(Rectangle())
        .onTapGesture { if !cat.isSystem { editingCategory = cat } }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if !cat.isSystem {
                Button(role: .destructive) {
                    categoryToDelete = cat
                } label: {
                    Label("Șterge", systemImage: "trash")
                }
                Button {
                    editingCategory = cat
                } label: {
                    Label("Editează", systemImage: "pencil")
                }
                .tint(.accentColor)
            }
        }
        .contextMenu {
            if !cat.isSystem {
                Button {
                    editingCategory = cat
                } label: {
                    Label("Redenumește", systemImage: "pencil")
                }
                Button(role: .destructive) {
                    categoryToDelete = cat
                } label: {
                    Label("Șterge", systemImage: "trash")
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(cat.isSystem ? "Subcategorie de sistem \(cat.name)" : "Subcategorie \(cat.name)")
        .accessibilityHint(cat.isSystem ? "Categorie de sistem, blocata" : "Atinge pentru a redenumi")
        .accessibilityAddTraits(cat.isSystem ? [] : .isButton)
    }

    // MARK: - Actions

    private func loadSupers(selectFirst: Bool = false) async {
        isLoadingSupers = true
        defer { isLoadingSupers = false }
        do {
            let fetched = try await RecipeService.shared.fetchSuperCategories()
            supers = fetched
            // Keep current selection if still present; otherwise pick the first.
            if selectFirst || selectedKind == nil || !fetched.contains(where: { $0.kind == selectedKind }) {
                selectedKind = fetched.first?.kind
            }
            await loadCategories()
        } catch {
            self.error = "Nu s-au putut încărca super-categoriile."
        }
    }

    private func loadCategories() async {
        guard let kind = selectedKind else {
            categories = []
            return
        }
        isLoadingCategories = true
        defer { isLoadingCategories = false }
        do {
            categories = try await RecipeService.shared.fetchCategoryConfigs(kind: kind)
        } catch {
            self.error = "Nu s-au putut încărca subcategoriile."
        }
    }

    private func removeCategory(_ name: String) {
        guard let kind = selectedKind else { return }
        deletingCategory = name
        Task {
            do {
                _ = try await RecipeService.shared.removeCategory(name: name, kind: kind)
                await loadCategories()
            } catch {
                self.error = "Nu s-a putut șterge subcategoria."
            }
            deletingCategory = nil
        }
    }

    private func deleteSuper(_ sup: SuperCategory) {
        Task {
            do {
                let updated = try await RecipeService.shared.deleteSuperCategory(kind: sup.kind)
                withAnimation(.spring(.snappy)) {
                    supers = updated
                    if selectedKind == sup.kind {
                        selectedKind = updated.first?.kind
                    }
                }
                await loadCategories()
            } catch {
                self.error = "Nu s-a putut șterge super-categoria."
            }
        }
    }
}

// MARK: - Super chip

private struct SuperChip: View {
    let superCategory: SuperCategory
    let isSelected: Bool
    let action: () -> Void

    private var color: Color { AppTheme.Colors.category(hex: superCategory.color) }

    var body: some View {
        Button(action: action) {
            HStack(spacing: AppTheme.Spacing.sm) {
                Circle()
                    .fill(color)
                    .frame(width: 12, height: 12)
                    .overlay(Circle().strokeBorder(.white.opacity(isSelected ? 0.6 : 0), lineWidth: 1))
                Text(superCategory.name)
                    .font(.subheadline.weight(isSelected ? .semibold : .regular))
                    .lineLimit(1)
            }
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.vertical, AppTheme.Spacing.sm)
            .frame(minHeight: 44)
            .foregroundStyle(isSelected ? color : .primary)
            .background(
                Capsule().fill(isSelected ? color.opacity(0.16) : Color(.secondarySystemFill))
            )
            .overlay(
                Capsule().strokeBorder(color.opacity(isSelected ? 0.9 : 0), lineWidth: 2)
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(superCategory.name)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Badges & swatches

private struct SystemBadge: View {
    var body: some View {
        Text("Sistem")
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color(.secondarySystemFill))
            .foregroundStyle(.secondary)
            .clipShape(Capsule())
    }
}

private struct ColorSwatch: View {
    let color: Color
    var size: CGFloat = 22

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .overlay(Circle().strokeBorder(Color(.separator), lineWidth: 0.5))
            .accessibilityHidden(true)
    }
}

// MARK: - Create Category Sheet (Super / Sub segmented choice)

private struct CreateCategorySheet: View {
    let selectedSuper: SuperCategory?
    let onCreatedSuper: ([SuperCategory], String?) async -> Void
    let onCreatedSub: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @FocusState private var nameFocused: Bool

    private enum Mode: String, CaseIterable, Identifiable {
        case superCategory
        case subCategory
        var id: String { rawValue }
        var label: String {
            switch self {
            case .superCategory: "Super-categorie"
            case .subCategory: "Sub-categorie"
            }
        }
    }

    @State private var mode: Mode
    @State private var name = ""
    @State private var selectedColor = AppTheme.Colors.categoryPresets[0]
    @State private var isSaving = false
    @State private var saveTrigger = false
    @State private var error: String?

    init(
        selectedSuper: SuperCategory?,
        onCreatedSuper: @escaping ([SuperCategory], String?) async -> Void,
        onCreatedSub: @escaping () async -> Void
    ) {
        self.selectedSuper = selectedSuper
        self.onCreatedSuper = onCreatedSuper
        self.onCreatedSub = onCreatedSub
        // Default to "sub" only when a super is selected to host it.
        _mode = State(initialValue: selectedSuper == nil ? .superCategory : .subCategory)
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }
    private var canSave: Bool {
        guard !trimmedName.isEmpty, !isSaving else { return false }
        if mode == .subCategory { return selectedSuper != nil }
        return true
    }
    private var subColor: Color { AppTheme.Colors.category(hex: selectedSuper?.color) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Tip", selection: $mode) {
                        ForEach(Mode.allCases) { m in
                            Text(m.label).tag(m)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowInsets(EdgeInsets(top: AppTheme.Spacing.sm, leading: AppTheme.Spacing.lg, bottom: AppTheme.Spacing.sm, trailing: AppTheme.Spacing.lg))
                    .listRowBackground(Color.clear)
                    .disabled(selectedSuper == nil)
                }

                if mode == .superCategory {
                    superFields
                } else {
                    subFields
                }
            }
            .navigationTitle("Adaugă categorie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anulează") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Salvează") { save() }
                            .disabled(!canSave)
                            .fontWeight(.semibold)
                    }
                }
            }
            .alert("Eroare", isPresented: .constant(error != nil)) {
                Button("OK") { error = nil }
            } message: {
                Text(error ?? "")
            }
            .sensoryFeedback(.success, trigger: saveTrigger)
        }
        // Fixed detent for both modes — switching Super/Sub must not resize the
        // sheet (that caused the flicker / height jump).
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear { nameFocused = true }
    }

    @ViewBuilder
    private var superFields: some View {
        Section {
            HStack {
                Spacer()
                SuperColorPreview(name: trimmedName.isEmpty ? "Super-categorie" : trimmedName, hex: selectedColor)
                Spacer()
            }
            .listRowBackground(Color.clear)
        }

        Section {
            TextField("Nume super-categorie...", text: $name)
                .textInputAutocapitalization(.words)
                .submitLabel(.done)
                .focused($nameFocused)
                .onSubmit { if canSave { save() } }
        } header: {
            Text("Nume")
        }

        Section {
            ColorPaletteGrid(selectedHex: $selectedColor)
            ColorPicker("Culoare personalizata", selection: customColorBinding, supportsOpacity: false)
        } header: {
            Text("Culoare")
        } footer: {
            Text("Subcategoriile acestei super-categorii vor folosi această culoare.")
        }
    }

    @ViewBuilder
    private var subFields: some View {
        Section {
            TextField("Nume subcategorie...", text: $name)
                .textInputAutocapitalization(.words)
                .submitLabel(.done)
                .focused($nameFocused)
                .onSubmit { if canSave { save() } }
        } header: {
            Text("Nume")
        } footer: {
            HStack(spacing: AppTheme.Spacing.sm) {
                Circle().fill(subColor).frame(width: 12, height: 12)
                if let s = selectedSuper {
                    Text("Se adaugă în „\(s.name)” și folosește culoarea ei.")
                } else {
                    Text("Selectează întâi o super-categorie.")
                }
            }
        }
    }

    private var customColorBinding: Binding<Color> {
        Binding(
            get: { AppTheme.Colors.category(hex: selectedColor) },
            set: { selectedColor = $0.hexString }
        )
    }

    private func save() {
        guard canSave else { return }
        isSaving = true
        Task {
            do {
                if mode == .superCategory {
                    let before = Set(try await currentKinds())
                    let updated = try await RecipeService.shared.createSuperCategory(name: trimmedName, color: selectedColor)
                    let newKind = updated.first { !before.contains($0.kind) }?.kind
                    saveTrigger.toggle()
                    await onCreatedSuper(updated, newKind)
                    dismiss()
                } else if let s = selectedSuper {
                    _ = try await RecipeService.shared.addCategory(name: trimmedName, kind: s.kind)
                    saveTrigger.toggle()
                    await onCreatedSub()
                    dismiss()
                }
            } catch {
                self.error = mode == .superCategory
                    ? "Nu s-a putut adăuga super-categoria."
                    : "Nu s-a putut adăuga subcategoria."
                isSaving = false
            }
        }
    }

    /// Used to detect which super-category is newly created so we can auto-select it.
    private func currentKinds() async throws -> [String] {
        try await RecipeService.shared.fetchSuperCategories().map(\.kind)
    }
}

// MARK: - Edit Super Category Sheet (rename if not system + recolour)

private struct EditSuperCategorySheet: View {
    let superCategory: SuperCategory
    let onSaved: ([SuperCategory]) -> Void

    @Environment(\.dismiss) private var dismiss
    @FocusState private var nameFocused: Bool

    @State private var name: String
    @State private var selectedColor: String
    @State private var isSaving = false
    @State private var saveTrigger = false
    @State private var error: String?

    init(superCategory: SuperCategory, onSaved: @escaping ([SuperCategory]) -> Void) {
        self.superCategory = superCategory
        self.onSaved = onSaved
        _name = State(initialValue: superCategory.name)
        _selectedColor = State(initialValue: superCategory.color)
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }
    private var nameChanged: Bool {
        !superCategory.isSystem && trimmedName != superCategory.name && !trimmedName.isEmpty
    }
    private var colorChanged: Bool {
        selectedColor.caseInsensitiveCompare(superCategory.color) != .orderedSame
    }
    private var canSave: Bool { (nameChanged || colorChanged) && !isSaving && !trimmedName.isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Spacer()
                        SuperColorPreview(name: trimmedName.isEmpty ? superCategory.name : trimmedName, hex: selectedColor)
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                }

                Section {
                    if superCategory.isSystem {
                        LabeledContent("Nume") {
                            Text(superCategory.name)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        TextField("Nume super-categorie...", text: $name)
                            .textInputAutocapitalization(.words)
                            .submitLabel(.done)
                            .focused($nameFocused)
                            .onSubmit { if canSave { save() } }
                    }
                } header: {
                    Text("Nume")
                } footer: {
                    if superCategory.isSystem {
                        Text("Categorie de sistem: numele nu poate fi schimbat.")
                    }
                }

                Section {
                    ColorPaletteGrid(selectedHex: $selectedColor)
                    ColorPicker("Culoare personalizata", selection: customColorBinding, supportsOpacity: false)
                } header: {
                    Text("Culoare")
                } footer: {
                    Text("Toate subcategoriile moștenesc această culoare.")
                }
            }
            .navigationTitle(superCategory.isSystem ? "Schimbă culoarea" : "Editează")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anulează") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Salvează") { save() }
                            .disabled(!canSave)
                            .fontWeight(.semibold)
                    }
                }
            }
            .alert("Eroare", isPresented: .constant(error != nil)) {
                Button("OK") { error = nil }
            } message: {
                Text(error ?? "")
            }
            .sensoryFeedback(.success, trigger: saveTrigger)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var customColorBinding: Binding<Color> {
        Binding(
            get: { AppTheme.Colors.category(hex: selectedColor) },
            set: { selectedColor = $0.hexString }
        )
    }

    private func save() {
        guard canSave else { return }
        isSaving = true
        Task {
            do {
                let newName: String? = nameChanged ? trimmedName : nil
                let newColor: String? = colorChanged ? selectedColor : nil
                let updated = try await RecipeService.shared.updateSuperCategory(
                    kind: superCategory.kind,
                    name: newName,
                    color: newColor
                )
                saveTrigger.toggle()
                onSaved(updated)
                dismiss()
            } catch {
                self.error = "Nu s-au putut salva modificarile."
                isSaving = false
            }
        }
    }
}

// MARK: - Super Colour Preview

private struct SuperColorPreview: View {
    let name: String
    let hex: String

    private var color: Color { AppTheme.Colors.category(hex: hex) }

    var body: some View {
        VStack(spacing: AppTheme.Spacing.sm) {
            Circle()
                .fill(color)
                .frame(width: 56, height: 56)
                .overlay(Circle().strokeBorder(Color(.separator), lineWidth: 0.5))

            Text(name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)
                .lineLimit(1)

            HStack(spacing: AppTheme.Spacing.sm) {
                ForEach(0..<2, id: \.self) { _ in
                    Text("Subcategorie")
                        .font(.caption)
                        .padding(.horizontal, AppTheme.Spacing.md)
                        .padding(.vertical, AppTheme.Spacing.xs)
                        .background(color.opacity(0.12))
                        .foregroundStyle(color)
                        .clipShape(Capsule())
                        .overlay(Capsule().strokeBorder(color.opacity(0.4), lineWidth: 1))
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Previzualizare culoare \(name)")
    }
}

// MARK: - Rename Category Sheet (name only)

private struct RenameCategorySheet: View {
    let category: CategoryConfig
    let kind: String
    let superColorHex: String?
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @FocusState private var nameFocused: Bool

    @State private var name: String
    @State private var isSaving = false
    @State private var saveTrigger = false
    @State private var error: String?

    init(category: CategoryConfig, kind: String, superColorHex: String?, onSaved: @escaping () async -> Void) {
        self.category = category
        self.kind = kind
        self.superColorHex = superColorHex
        self.onSaved = onSaved
        _name = State(initialValue: category.name)
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }
    private var canSave: Bool { !trimmedName.isEmpty && !isSaving && trimmedName != category.name }
    private var color: Color { AppTheme.Colors.category(hex: superColorHex) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nume subcategorie...", text: $name)
                        .textInputAutocapitalization(.words)
                        .submitLabel(.done)
                        .focused($nameFocused)
                        .onSubmit { if canSave { save() } }
                } header: {
                    Text("Nume")
                } footer: {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        Circle().fill(color).frame(width: 12, height: 12)
                        Text("Foloseste culoarea super-categoriei.")
                    }
                }
            }
            .navigationTitle("Redenumește")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anulează") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Salvează") { save() }
                            .disabled(!canSave)
                            .fontWeight(.semibold)
                    }
                }
            }
            .alert("Eroare", isPresented: .constant(error != nil)) {
                Button("OK") { error = nil }
            } message: {
                Text(error ?? "")
            }
            .sensoryFeedback(.success, trigger: saveTrigger)
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .onAppear { nameFocused = true }
    }

    private func save() {
        guard canSave else { return }
        isSaving = true
        Task {
            do {
                _ = try await RecipeService.shared.renameCategory(
                    oldName: category.name,
                    newName: trimmedName,
                    kind: kind
                )
                saveTrigger.toggle()
                await onSaved()
                dismiss()
            } catch {
                self.error = "Nu s-au putut salva modificarile."
                isSaving = false
            }
        }
    }
}

// MARK: - Color Palette Grid

private struct ColorPaletteGrid: View {
    @Binding var selectedHex: String

    private let columns = Array(repeating: GridItem(.flexible(), spacing: AppTheme.Spacing.md), count: 6)

    var body: some View {
        LazyVGrid(columns: columns, spacing: AppTheme.Spacing.md) {
            ForEach(AppTheme.Colors.categoryPresets, id: \.self) { hex in
                let isSelected = hex.caseInsensitiveCompare(selectedHex) == .orderedSame
                Button {
                    selectedHex = hex
                } label: {
                    Circle()
                        .fill(AppTheme.Colors.category(hex: hex))
                        .frame(width: 36, height: 36)
                        .overlay {
                            if isSelected {
                                Image(systemName: "checkmark")
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(.white)
                            }
                        }
                        .overlay(
                            Circle().strokeBorder(
                                isSelected ? Color.primary : Color(.separator),
                                lineWidth: isSelected ? 2 : 0.5
                            )
                        )
                        .padding(2)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Culoare \(hex)")
                .accessibilityAddTraits(isSelected ? [.isSelected] : [])
            }
        }
        .padding(.vertical, AppTheme.Spacing.xs)
        .animation(.spring(.snappy), value: selectedHex)
        .sensoryFeedback(.selection, trigger: selectedHex)
    }
}

// MARK: - Helpers

private extension CategoryConfig {
    /// The kind to pass when renaming this sub-category.
    func kindForRename(_ selectedKind: String?) -> String {
        selectedKind ?? ""
    }
}

#Preview {
    NavigationStack {
        CategoryManagementView()
    }
}
