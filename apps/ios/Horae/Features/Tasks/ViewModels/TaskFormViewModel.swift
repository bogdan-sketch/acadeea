import Foundation
import Observation

enum TaskFormMode: Hashable {
    case create
    case edit(String)
}

@Observable
final class TaskFormViewModel {
    let mode: TaskFormMode
    let preselectedRecipeId: String?

    // Form fields
    var recipeId = ""
    var selectedRecipeName: String?
    var targetQuantity: Double = 1
    var targetUnit: UnitType = .BUCATI
    var priority: Int = 0
    var plannedDate: Date?
    var dueDate: Date?
    var notes = ""
    var assignedToId: String?
    var selectedUserName: String?
    /// Nume custom (gol = numele retetei).
    var title = ""
    /// Cine vede taskul in afara administratorilor (ei vad tot).
    var visibility: TaskVisibility = .ASSIGNED
    /// Persoanele alese cand visibility = SELECTED (id -> nume, pentru afisare).
    var visibleTo: [String: String] = [:]
    var showViewerPicker = false
    /// Edit mode: the task already had a custom name / non-default visibility.
    private var hadTitle = false
    private var hadVisibility = false

    private var cleanTitle: String? {
        let t = title.trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? nil : t
    }
    var locationId: String?
    var availableLocations: [LocationResponse] = []

    // MARK: - "Mai multe produse" (familie de taskuri)

    /// One recipe line of a multi-product batch.
    struct MultiItem: Identifiable, Equatable {
        let id = UUID()
        var recipeId = ""
        var recipeName: String?
        /// Kept as text so a Romanian keyboard's comma still parses.
        var quantity = ""
        /// Follows the recipe's own yield unit — the backend scales by
        /// targetQuantity / yield in that unit, so it is never editable.
        var unit: UnitType = .BUCATI

        var parsedQuantity: Double? {
            RoFormat.parseDecimal(quantity)
        }

        var isValid: Bool {
            !recipeId.isEmpty && (parsedQuantity ?? 0) > 0
        }
    }

    /// Batch mode toggle — single-product stays the default.
    var isMultiMode = false
    var multiItems: [MultiItem] = [MultiItem()]
    var groupLabel = ""
    var includeSemipreparate = false
    /// Row whose recipe picker is open (nil = closed).
    var multiPickerRow: Int?

    // UI state
    var showRecipePicker = false
    var showUserPicker = false
    var isLoading = false
    var isSaving = false
    var error: APIError?
    var didSave = false

    // Live stock check — recomputed as recipe/quantity change.
    var materialRequirements: [TaskMaterialRequirement] = []
    var isCheckingStock = false

    /// Materials whose available stock can't cover the requested quantity.
    var insufficientMaterials: [TaskMaterialRequirement] {
        materialRequirements.filter { !$0.sufficient }
    }

    var hasStockShortage: Bool { !insufficientMaterials.isEmpty }

    private let service = TaskService.shared
    private let recipeService = RecipeService.shared
    private let locationService = LocationService.shared
    private let log = AppLogger.shared
    private var stockCheckTask: Task<Void, Never>?

    /// Display name for the currently selected production location.
    var selectedLocationName: String? {
        availableLocations.first { $0.id == locationId }?.name
    }

    init(mode: TaskFormMode, preselectedRecipeId: String? = nil) {
        self.mode = mode
        self.preselectedRecipeId = preselectedRecipeId
    }

    var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    var navigationTitle: String {
        if isEditing { return "Editare task" }
        return isMultiMode ? "Taskuri noi" : "Task nou"
    }

    var isFormValid: Bool {
        if isMultiMode { return multiItems.contains(where: \.isValid) }
        return !recipeId.isEmpty && targetQuantity > 0
    }

    // MARK: - Multi rows

    func addMultiItem() {
        multiItems.append(MultiItem())
    }

    func removeMultiItem(id: UUID) {
        multiItems.removeAll { $0.id == id }
        if multiItems.isEmpty { multiItems.append(MultiItem()) }
    }

    /// Pick a recipe for one batch row — prefills its quantity with the recipe
    /// yield and locks the unit to the recipe's own, same as the single form.
    func selectMultiRecipe(row: Int, id: String, name: String, unit: UnitType, yieldQuantity: Double) {
        guard multiItems.indices.contains(row) else { return }
        multiItems[row].recipeId = id
        multiItems[row].recipeName = name
        multiItems[row].unit = unit
        if multiItems[row].quantity.isEmpty, yieldQuantity > 0 {
            multiItems[row].quantity = yieldQuantity.qtyFormatted
        }
    }

    // MARK: - Unsaved-changes tracking

    /// Snapshot of the user-editable value fields (transient UI/stock-check
    /// state excluded) used to detect edits.
    private struct Snapshot: Equatable {
        var recipeId: String
        var selectedRecipeName: String?
        var targetQuantity: Double
        var targetUnit: UnitType
        var priority: Int
        var plannedDate: Date?
        var dueDate: Date?
        var notes: String
        var assignedToId: String?
        var selectedUserName: String?
        var locationId: String?
        var isMultiMode: Bool
        var multiItems: [MultiItem]
        var groupLabel: String
        var includeSemipreparate: Bool
    }

    private var initialSnapshot: Snapshot?

    private var currentSnapshot: Snapshot {
        Snapshot(
            recipeId: recipeId,
            selectedRecipeName: selectedRecipeName,
            targetQuantity: targetQuantity,
            targetUnit: targetUnit,
            priority: priority,
            plannedDate: plannedDate,
            dueDate: dueDate,
            notes: notes,
            assignedToId: assignedToId,
            selectedUserName: selectedUserName,
            locationId: locationId,
            isMultiMode: isMultiMode,
            multiItems: multiItems,
            groupLabel: groupLabel,
            includeSemipreparate: includeSemipreparate
        )
    }

    /// Whether the form has unsaved changes relative to its initial snapshot.
    var isDirty: Bool {
        guard let initialSnapshot else { return false }
        return currentSnapshot != initialSnapshot
    }

    /// Capture the baseline for change detection once the initial loads settle.
    func captureSnapshot() {
        initialSnapshot = currentSnapshot
    }

    // MARK: - Load existing task for editing

    func loadIfEditing() async {
        guard case .edit(let id) = mode else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            let task = try await service.fetchTask(id: id)
            recipeId = task.recipeId
            selectedRecipeName = task.recipeName
            targetQuantity = task.targetQuantity
            targetUnit = task.targetUnit
            locationId = task.locationId
            recomputeStock()
            priority = task.priority
            plannedDate = task.plannedDate
            dueDate = task.dueDate
            notes = task.notes ?? ""
            assignedToId = task.assignedToId
            if let assignee = task.assignedTo {
                selectedUserName = assignee.fullName
            }
            title = task.title ?? ""
            visibility = task.visibility ?? .ASSIGNED
            hadTitle = !(task.title ?? "").isEmpty
            hadVisibility = (task.visibility ?? .ASSIGNED) != .ASSIGNED
            visibleTo = Dictionary(uniqueKeysWithValues: (task.visibleToIds ?? []).map { ($0, "") })
            await resolveViewerNames()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    // MARK: - Recipe selection

    /// Pick a recipe in the form — default the target unit to the recipe's own
    /// unit and prefill the quantity with the recipe's yield (e.g. 100 buc), so
    /// the user starts from the real recipe output and only edits to scale up.
    func selectRecipe(id: String, name: String, unit: UnitType, yieldQuantity: Double) {
        recipeId = id
        selectedRecipeName = name
        targetUnit = unit
        if yieldQuantity > 0 {
            targetQuantity = yieldQuantity
        }
        recomputeStock()
    }

    // MARK: - Load preselected recipe

    func loadPreselectedRecipe() async {
        guard let preselectedRecipeId, recipeId.isEmpty else { return }

        do {
            let recipe = try await recipeService.fetchRecipe(id: preselectedRecipeId)
            recipeId = recipe.id
            selectedRecipeName = recipe.name
            targetUnit = recipe.unit
            if recipe.yieldQuantity > 0 {
                targetQuantity = recipe.yieldQuantity
            }
            recomputeStock()
        } catch {
            log.log("TaskForm.loadPreselectedRecipe: error=\(error)", level: .error)
        }
    }

    // MARK: - Locations

    /// Load the locations the user can produce at and prefill the default one.
    /// Falls back to all active locations when the user has none assigned.
    ///
    /// Production almost always happens in the laborator, so a location whose
    /// name contains "laborator" wins over the plain first entry. There is no
    /// per-user saved choice today — an already-set `locationId` (edit mode or
    /// an explicit pick) is never overwritten.
    func loadLocations() async {
        do {
            var locations = try await locationService.fetchMyLocations()
            if locations.isEmpty {
                locations = try await locationService.fetchLocations().filter { $0.isActive }
            }
            availableLocations = locations
            if locationId == nil, let preferred = Self.defaultLocation(in: locations) {
                locationId = preferred.id
                recomputeStock()
            }
        } catch {
            log.log("TaskForm.loadLocations: error=\(error)", level: .error)
        }
    }

    /// The organization's default location when set (Stoc › Locatii), else the
    /// laborator by name, else the user's first location (`preferredDefault`).
    static func defaultLocation(in locations: [LocationResponse]) -> LocationResponse? {
        locations.preferredDefault
    }

    // MARK: - Viewers (visibility = SELECTED)

    func toggleViewer(id: String, name: String) {
        if visibleTo[id] != nil { visibleTo.removeValue(forKey: id) } else { visibleTo[id] = name }
    }

    var viewerNames: [String] { visibleTo.values.filter { !$0.isEmpty }.sorted() }

    /// Edit mode gives ids only — look the names up for the chips.
    private func resolveViewerNames() async {
        guard !visibleTo.isEmpty, let users = try? await UserService.shared.searchUsers(name: "") else { return }
        for user in users where visibleTo[user.id] != nil { visibleTo[user.id] = user.fullName }
    }

    func selectLocation(id: String) {
        locationId = id
        recomputeStock()
    }

    // MARK: - Live stock check

    /// Recompute scaled material requirements for the current recipe + quantity,
    /// debounced. Drives the insufficient-stock warning. Best-effort — failures
    /// just clear the warning, never block the form.
    func recomputeStock() {
        stockCheckTask?.cancel()

        guard !recipeId.isEmpty, targetQuantity > 0 else {
            materialRequirements = []
            return
        }

        let recipeId = self.recipeId
        let targetQuantity = self.targetQuantity
        let targetUnit = self.targetUnit
        let locationId = self.locationId

        stockCheckTask = Task { [weak self] in
            // Debounce rapid quantity edits.
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled, let self else { return }

            self.isCheckingStock = true
            defer { self.isCheckingStock = false }

            do {
                let reqs = try await self.service.previewRequirements(
                    recipeId: recipeId,
                    targetQuantity: targetQuantity,
                    targetUnit: targetUnit,
                    locationId: locationId
                )
                if !Task.isCancelled {
                    self.materialRequirements = reqs
                }
            } catch {
                if !Task.isCancelled {
                    self.materialRequirements = []
                }
            }
        }
    }

    // MARK: - Save

    func save() async {
        isSaving = true
        error = nil
        defer { isSaving = false }

        log.log("TaskForm.save: mode=\(isEditing ? "edit" : "create") recipeId=\(recipeId)")

        // Both pickers are date-only: send local 00:00 so every screen reads
        // the value as a date without a time (RoDate.isDateOnly).
        let dateFormatter = ISO8601DateFormatter()

        do {
            switch mode {
            case .create where isMultiMode:
                let items = multiItems.compactMap { item -> MultiTaskItemRequest? in
                    guard item.isValid, let qty = item.parsedQuantity else { return nil }
                    return MultiTaskItemRequest(
                        recipeId: item.recipeId,
                        targetQuantity: qty,
                        targetUnit: item.unit
                    )
                }
                guard !items.isEmpty else {
                    error = .unknown("Adauga cel putin un produs cu cantitate")
                    return
                }
                let label = groupLabel.trimmingCharacters(in: .whitespacesAndNewlines)
                let body = CreateMultiTaskRequest(
                    items: items,
                    groupLabel: label.isEmpty ? nil : label,
                    includeSemipreparate: includeSemipreparate ? true : nil,
                    dueDate: dueDate.map { dateFormatter.string(from: RoDate.calendarDay($0)) },
                    plannedDate: plannedDate.map { dateFormatter.string(from: RoDate.calendarDay($0)) },
                    locationId: locationId,
                    assignedToId: assignedToId,
                    priority: priority,
                    notes: notes.isEmpty ? nil : notes
                )
                let result = try await service.createMultiTasks(body)
                log.log("TaskForm.save: created \(result.tasks.count) tasks in group \(result.groupId)")
                await ToastCenter.shared.show(
                    "\(result.tasks.count) taskuri create",
                    lines: label.isEmpty ? [] : [label]
                )

            case .create:
                let body = CreateTaskRequest(
                    recipeId: recipeId,
                    targetQuantity: targetQuantity,
                    targetUnit: targetUnit,
                    priority: priority,
                    plannedDate: plannedDate.map { dateFormatter.string(from: RoDate.calendarDay($0)) },
                    dueDate: dueDate.map { dateFormatter.string(from: RoDate.calendarDay($0)) },
                    notes: notes.isEmpty ? nil : notes,
                    assignedToId: assignedToId,
                    locationId: locationId,
                    // Only when used: an API without these fields (prod before
                    // the matching release) rejects unknown properties.
                    title: cleanTitle,
                    visibility: visibility == .ASSIGNED ? nil : visibility,
                    visibleToIds: visibility == .SELECTED ? Array(visibleTo.keys) : nil
                )
                _ = try await service.createTask(body)
                log.log("TaskForm.save: created successfully")

            case .edit(let id):
                let body = UpdateTaskRequest(
                    targetQuantity: targetQuantity,
                    targetUnit: targetUnit,
                    priority: priority,
                    // An untouched date goes back as loaded (keeps a time set on the web).
                    plannedDate: plannedDate.map {
                        dateFormatter.string(from: $0 == initialSnapshot?.plannedDate ? $0 : RoDate.calendarDay($0))
                    },
                    dueDate: dueDate.map {
                        dateFormatter.string(from: $0 == initialSnapshot?.dueDate ? $0 : RoDate.calendarDay($0))
                    },
                    notes: notes.isEmpty ? nil : notes,
                    assignedToId: assignedToId,
                    locationId: locationId,
                    // "" clears a previous custom name; nil = don't touch (and stays
                    // compatible with an API that doesn't know the field yet).
                    title: (cleanTitle == nil && !hadTitle) ? nil : (cleanTitle ?? ""),
                    visibility: (visibility == .ASSIGNED && !hadVisibility) ? nil : visibility,
                    visibleToIds: visibility == .SELECTED ? Array(visibleTo.keys) : nil
                )
                _ = try await service.updateTask(id: id, body)
                log.log("TaskForm.save: updated successfully")
            }

            didSave = true
        } catch let err as APIError {
            log.log("TaskForm.save: error=\(err.errorDescription ?? "nil")", level: .error)
            error = err
        } catch {
            log.log("TaskForm.save: error=\(error)", level: .error)
            self.error = .networkError(error)
        }
    }
}
