import SwiftUI
import Observation

// MARK: - State

/// Multi-select state for a list screen ("Selectează" mode). One instance per
/// list view (`@State private var selection = BulkSelection()`); rows read it
/// through `BulkSelectRow`, the bottom bar through `.bulkSelectBar(...)`.
@Observable
final class BulkSelection {
    var isActive = false
    var selected: Set<String> = []

    var count: Int { selected.count }

    func contains(_ id: String) -> Bool { selected.contains(id) }

    func toggle(_ id: String) {
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }

    func selectAll(_ ids: [String]) { selected = Set(ids) }

    func clear() { selected.removeAll() }

    func enter() {
        selected.removeAll()
        withAnimation(.snappy) { isActive = true }
    }

    func exit() {
        selected.removeAll()
        withAnimation(.snappy) { isActive = false }
    }
}

// MARK: - Row

/// A list row that navigates to `route` normally and, while selection mode is
/// active, shows a leading checkmark and toggles its id on tap instead.
struct BulkSelectRow<Content: View>: View {
    let id: String
    let selection: BulkSelection
    let route: Route
    @ViewBuilder let content: () -> Content

    var body: some View {
        if selection.isActive {
            let isOn = selection.contains(id)
            Button {
                selection.toggle(id)
            } label: {
                HStack(spacing: AppTheme.Spacing.sm) {
                    Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isOn ? AppTheme.Colors.primary : Color.secondary)
                        .accessibilityHidden(true)
                    content()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isOn ? .isSelected : [])
            .accessibilityHint(isOn ? "Deselectează" : "Selectează")
        } else {
            NavigationLink(value: route) { content() }
        }
    }
}

// MARK: - Toolbar toggle

private struct BulkSelectToolbarModifier: ViewModifier {
    let selection: BulkSelection
    let isEnabled: Bool

    func body(content: Content) -> some View {
        content.toolbar {
            if isEnabled {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if selection.isActive { selection.exit() } else { selection.enter() }
                    } label: {
                        if selection.isActive {
                            Text("Gata").fontWeight(.semibold)
                        } else {
                            Image(systemName: "checkmark.circle")
                        }
                    }
                    .accessibilityLabel(selection.isActive ? "Gata" : "Selectează")
                }
            }
        }
    }
}

// MARK: - Bulk actions (other than delete)

/// How an action collects its parameter before running. Enum/bool render as
/// nested menu entries; the others open a small picker sheet.
enum BulkActionParam {
    case none
    case choice(key: String, options: [(value: BulkParamValue, label: String)])
    case bool(key: String, trueLabel: String, falseLabel: String)
    case user(key: String)
    case location(key: String)
    case supplier(key: String)
    case category(key: String, kinds: [String])
    case date(key: String)
    case number(key: String, label: String)
}

struct BulkAction: Identifiable {
    /// API action key (`POST …/bulk-action { action }`).
    let key: String
    let label: String
    let systemImage: String
    let param: BulkActionParam
    var id: String { key }
}

/// Per-screen action lists — mirror `BULK_ACTIONS` in the API (`bulk-actions.resources.ts`).
enum BulkActionCatalog {
    static let tasks: [BulkAction] = [
        BulkAction(key: "status", label: "Schimbă starea", systemImage: "arrow.triangle.2.circlepath",
                   param: .choice(key: "status", options: [
                       (.string("DE_FACUT"), "De făcut"), (.string("IN_LUCRU"), "În lucru"), (.string("ANULAT"), "Anulează"),
                   ])),
        BulkAction(key: "assign", label: "Asignează", systemImage: "person", param: .user(key: "assignedToId")),
        BulkAction(key: "plannedDate", label: "Data planificată", systemImage: "calendar", param: .date(key: "plannedDate")),
        BulkAction(key: "dueDate", label: "Termen", systemImage: "calendar.badge.clock", param: .date(key: "dueDate")),
        BulkAction(key: "priority", label: "Prioritate", systemImage: "flag",
                   param: .choice(key: "priority", options: (1...5).map { (.int($0), "Prioritate \($0)") })),
        BulkAction(key: "location", label: "Locație", systemImage: "mappin.and.ellipse", param: .location(key: "locationId")),
    ]
    static let orders: [BulkAction] = [
        BulkAction(key: "status", label: "Schimbă starea", systemImage: "arrow.triangle.2.circlepath",
                   param: .choice(key: "status", options: OrderStatus.allCases.map { (.string($0.rawValue), $0.displayName) })),
        BulkAction(key: "assign", label: "Asignează livrator", systemImage: "person", param: .user(key: "assignedToId")),
        BulkAction(key: "dueDate", label: "Termen", systemImage: "calendar.badge.clock", param: .date(key: "dueDate")),
        BulkAction(key: "archive", label: "Arhivare", systemImage: "archivebox",
                   param: .bool(key: "archived", trueLabel: "Arhivează", falseLabel: "Dezarhivează")),
    ]
    static let transfers: [BulkAction] = [
        BulkAction(key: "status", label: "Schimbă starea", systemImage: "arrow.triangle.2.circlepath",
                   param: .choice(key: "status", options: [
                       (.string("IN_TRANZIT"), "În tranzit"), (.string("FINALIZAT"), "Finalizează"), (.string("ANULAT"), "Anulează"),
                   ])),
    ]
    static let rawMaterials: [BulkAction] = [
        BulkAction(key: "category", label: "Categorie", systemImage: "tag", param: .category(key: "category", kinds: ["MATERIE_PRIMA"])),
        BulkAction(key: "status", label: "Stare", systemImage: "circle.lefthalf.filled",
                   param: .choice(key: "status", options: [(.string("ACTIVE"), "Activ"), (.string("DISCONTINUED"), "Întrerupt")])),
        BulkAction(key: "supplier", label: "Furnizor", systemImage: "shippingbox", param: .supplier(key: "supplierId")),
        BulkAction(key: "minimumStock", label: "Stoc minim", systemImage: "gauge.low", param: .number(key: "minimumStock", label: "Stoc minim")),
    ]
    static let consumables: [BulkAction] = [
        BulkAction(key: "category", label: "Categorie", systemImage: "tag", param: .category(key: "category", kinds: ["MATERIE_PRIMA"])),
        BulkAction(key: "status", label: "Stare", systemImage: "circle.lefthalf.filled",
                   param: .choice(key: "status", options: [(.string("ACTIVE"), "Activ"), (.string("DISCONTINUED"), "Întrerupt")])),
        BulkAction(key: "minimumStock", label: "Stoc minim", systemImage: "gauge.low", param: .number(key: "minimumStock", label: "Stoc minim")),
    ]
    static let recipes: [BulkAction] = [
        BulkAction(key: "archive", label: "Arhivare", systemImage: "archivebox",
                   param: .bool(key: "archived", trueLabel: "Arhivează", falseLabel: "Dezarhivează")),
        BulkAction(key: "draft", label: "Ciornă", systemImage: "pencil.and.outline",
                   param: .bool(key: "draft", trueLabel: "Marchează ciornă", falseLabel: "Publică")),
        BulkAction(key: "category", label: "Categorie", systemImage: "tag",
                   param: .category(key: "category", kinds: ["PRODUS_FINIT", "SEMIPREPARAT"])),
    ]
    static let sales: [BulkAction] = [
        BulkAction(key: "discard", label: "Renunță la ciorne", systemImage: "xmark.circle", param: .none),
        BulkAction(key: "revert", label: "Anulează confirmările", systemImage: "arrow.uturn.backward", param: .none),
    ]
}

/// A chosen action + its params, waiting for the confirm alert.
private struct PendingBulkAction {
    let action: BulkAction
    let params: BulkParams
    /// Human text of the chosen value ("În lucru", "12.03.2026", a user's name…).
    let valueLabel: String?

    var title: String { valueLabel.map { "\(action.label): \($0)" } ?? action.label }
}

// MARK: - Bottom bar + confirm + result

private struct BulkSelectBarModifier: ViewModifier {
    let selection: BulkSelection
    let allIds: [String]
    let warning: String
    let canDelete: Bool
    let actions: [BulkAction]
    let onPreview: ([String]) async throws -> BulkDeletePreview
    let onDelete: ([String]) async throws -> BulkDeleteResult
    let onAction: ([String], String, BulkParams) async throws -> BulkActionResult
    let onDone: () async -> Void

    // delete flow
    @State private var showConfirm = false
    @State private var isPreviewing = false
    @State private var preview: BulkDeletePreview?
    // action flow
    @State private var pickerAction: BulkAction?
    @State private var pending: PendingBulkAction?
    @State private var showActionConfirm = false
    // shared
    @State private var isRunning = false
    @State private var runningText = ""
    @State private var failures: [BulkDeleteFailure] = []
    @State private var doneCount = 0
    @State private var resultVerb = "șterse"
    @State private var showFailures = false
    @State private var error: APIError?

    private var allSelected: Bool {
        !allIds.isEmpty && allIds.allSatisfy { selection.contains($0) }
    }
    private var busy: Bool { isRunning || isPreviewing }

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .bottom) {
                if selection.isActive { bar }
            }
            .alert("Ștergi \(selection.count) \(selection.count == 1 ? "element" : "elemente")?",
                   isPresented: $showConfirm, presenting: preview) { pv in
                Button(pv.dependents.isEmpty ? "Șterge" : "Șterge tot", role: .destructive) {
                    Task { await runDelete() }
                }
                Button("Anulează", role: .cancel) {}
            } message: { pv in
                Text(confirmMessage(pv))
            }
            .alert("Aplici „\(pending?.title ?? "")” la \(selection.count) \(selection.count == 1 ? "element" : "elemente")?",
                   isPresented: $showActionConfirm, presenting: pending) { pa in
                Button("Aplică") { Task { await runAction(pa) } }
                Button("Anulează", role: .cancel) {}
            } message: { _ in
                Text("Rândurile care nu permit acțiunea vor fi raportate, celelalte se actualizează.")
            }
            .alert(resultVerb == "șterse" ? "Ștergere parțială" : "Acțiune parțială", isPresented: $showFailures) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(failureMessage)
            }
            .sheet(item: $pickerAction) { action in
                BulkParamPickerSheet(action: action) { params, label in
                    pickerAction = nil
                    pending = PendingBulkAction(action: action, params: params, valueLabel: label)
                    showActionConfirm = true
                }
            }
            .errorAlert($error)
            .overlay {
                if isRunning {
                    ZStack {
                        Color.black.opacity(0.25).ignoresSafeArea()
                        ProgressView(runningText)
                            .padding(AppTheme.Spacing.xl)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .id("bulk-running-overlay")
                }
            }
    }

    private var bar: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            Button(allSelected ? "Niciuna" : "Toate") {
                if allSelected { selection.clear() } else { selection.selectAll(allIds) }
            }
            .font(.subheadline.weight(.medium))
            .disabled(allIds.isEmpty)

            Spacer(minLength: 0)

            Text("\(selection.count) selectate")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
                .monospacedDigit()

            Spacer(minLength: 0)

            if !actions.isEmpty {
                Menu {
                    ForEach(actions) { action in menuEntry(action) }
                } label: {
                    Label("Acțiuni", systemImage: "ellipsis.circle")
                        .font(.subheadline.weight(.semibold))
                }
                .menuOrder(.fixed)
                .disabled(selection.count == 0 || busy)
                .accessibilityLabel("Acțiuni")
            }

            if canDelete {
                Button(role: .destructive) {
                    Task { await loadPreview() }
                } label: {
                    Group {
                        if isPreviewing {
                            ProgressView().tint(.red)
                        } else {
                            Image(systemName: "trash")
                        }
                    }
                    .font(.body.weight(.semibold))
                    .frame(width: 22, height: 22)
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .disabled(selection.count == 0 || busy)
                .accessibilityLabel("Șterge")
            }
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.vertical, AppTheme.Spacing.sm)
        .frame(maxWidth: .infinity)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    @ViewBuilder
    private func menuEntry(_ action: BulkAction) -> some View {
        switch action.param {
        case .none:
            Button { confirm(action, [:], nil) } label: { Label(action.label, systemImage: action.systemImage) }
        case .choice(let key, let options):
            Menu {
                ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                    Button(opt.label) { confirm(action, [key: opt.value], opt.label) }
                }
            } label: { Label(action.label, systemImage: action.systemImage) }
        case .bool(let key, let trueLabel, let falseLabel):
            Menu {
                Button(trueLabel) { confirm(action, [key: .bool(true)], trueLabel) }
                Button(falseLabel) { confirm(action, [key: .bool(false)], falseLabel) }
            } label: { Label(action.label, systemImage: action.systemImage) }
        case .user, .location, .supplier, .category, .date, .number:
            Button { pickerAction = action } label: { Label("\(action.label)…", systemImage: action.systemImage) }
        }
    }

    private func confirm(_ action: BulkAction, _ params: BulkParams, _ valueLabel: String?) {
        pending = PendingBulkAction(action: action, params: params, valueLabel: valueLabel)
        showActionConfirm = true
    }

    private var failureMessage: String {
        var lines: [String] = []
        if resultVerb == "șterse" {
            lines.append(doneCount == 0 ? "Nu s-a șters nimic." : "\(doneCount) \(doneCount == 1 ? "element șters" : "elemente șterse").")
            lines.append("\(failures.count) nu s-au putut șterge:")
        } else {
            lines.append(doneCount == 0 ? "Nu s-a actualizat nimic." : "\(doneCount) \(doneCount == 1 ? "element actualizat" : "elemente actualizate").")
            lines.append("\(failures.count) nu s-au putut actualiza:")
        }
        for f in failures.prefix(4) { lines.append("• \(f.reason)") }
        if failures.count > 4 { lines.append("… și încă \(failures.count - 4)") }
        return lines.joined(separator: "\n")
    }

    /// Entity warning + what the cascade will also touch (from the preview).
    private func confirmMessage(_ pv: BulkDeletePreview) -> String {
        var lines: [String] = [warning]
        if !pv.dependents.isEmpty {
            lines.append("")
            lines.append("Se vor afecta și:")
            for d in pv.dependents { lines.append("• \(d.label): \(d.count)") }
            lines.append("Acestea se șterg sau se deconectează împreună cu elementele selectate.")
        }
        if !pv.missing.isEmpty {
            lines.append("")
            lines.append("\(pv.missing.count) nu mai \(pv.missing.count == 1 ? "există (va fi ignorat)" : "există (vor fi ignorate)").")
        }
        return lines.joined(separator: "\n")
    }

    /// Delete step 1 — ask the server what the delete would touch, then confirm.
    @MainActor
    private func loadPreview() async {
        let ids = Array(selection.selected)
        guard !ids.isEmpty else { return }
        isPreviewing = true
        defer { isPreviewing = false }
        do {
            preview = try await onPreview(ids)
            showConfirm = true
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Delete step 2 — the user confirmed the preview: cascade delete.
    @MainActor
    private func runDelete() async {
        let ids = Array(selection.selected)
        guard !ids.isEmpty else { return }
        isRunning = true
        runningText = "Se șterg…"
        defer { isRunning = false }
        do {
            let result = try await onDelete(ids)
            await finish(done: result.deleted.count, failed: result.failed, verb: "șterse")
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    @MainActor
    private func runAction(_ pa: PendingBulkAction) async {
        let ids = Array(selection.selected)
        guard !ids.isEmpty else { return }
        isRunning = true
        runningText = "Se aplică…"
        defer { isRunning = false }
        do {
            let result = try await onAction(ids, pa.action.key, pa.params)
            await finish(done: result.done.count, failed: result.failed, verb: "actualizate")
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    @MainActor
    private func finish(done: Int, failed: [BulkDeleteFailure], verb: String) async {
        doneCount = done
        failures = failed
        resultVerb = verb
        selection.exit()
        await onDone()
        if failures.isEmpty {
            ToastCenter.shared.show("\(done) \(done == 1 ? (verb == "șterse" ? "element șters" : "element actualizat") : "elemente \(verb)")")
        } else {
            showFailures = true
        }
    }
}

// MARK: - Parameter picker sheet (user / location / supplier / category / date / number)

private struct BulkParamPickerSheet: View {
    let action: BulkAction
    let onPick: (BulkParams, String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var options: [(value: BulkParamValue, label: String)] = []
    @State private var isLoading = false
    @State private var loadError: APIError?
    @State private var date = Date()
    @State private var numberText = ""

    var body: some View {
        NavigationStack {
            Group {
                switch action.param {
                case .date(let key):
                    Form {
                        DatePicker("Data", selection: $date, displayedComponents: [.date])
                            .datePickerStyle(.graphical)
                        Button("Aplică") {
                            onPick([key: .string(ISO8601DateFormatter().string(from: date))], Self.dateFormatter.string(from: date))
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                    }
                case .number(let key, let label):
                    Form {
                        TextField(label, text: $numberText)
                            .keyboardType(.decimalPad)
                        Button("Aplică") {
                            if let v = RoFormat.parseDecimal(numberText), v >= 0 {
                                onPick([key: .number(v)], RoFormat.inputText(v))
                            }
                        }
                        .disabled(RoFormat.parseDecimal(numberText) == nil)
                        .frame(maxWidth: .infinity, alignment: .center)
                    }
                default:
                    List {
                        if isLoading {
                            ProgressView().frame(maxWidth: .infinity)
                        } else if options.isEmpty {
                            Text("Nimic de ales.").foregroundStyle(.secondary)
                        } else {
                            ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                                Button {
                                    onPick([paramKey: opt.value], opt.label)
                                } label: {
                                    Text(opt.label).frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .buttonStyle(.plain)
                                .contentShape(Rectangle())
                            }
                        }
                    }
                }
            }
            .navigationTitle(action.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anulează") { dismiss() } }
            }
            .errorAlert($loadError)
            .task { await load() }
        }
        .presentationDetents([.medium, .large])
    }

    private var paramKey: String {
        switch action.param {
        case .user(let k), .location(let k), .supplier(let k), .date(let k), .choice(let k, _), .bool(let k, _, _): k
        case .category(let k, _): k
        case .number(let k, _): k
        case .none: ""
        }
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "dd.MM.yyyy"; return f
    }()

    @MainActor
    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            switch action.param {
            case .user:
                let page = try await UserService.shared.fetchUsers(query: UserQuery(limit: 100))
                options = page.data.map { (.string($0.id), $0.fullName) }
            case .location:
                options = try await LocationService.shared.fetchLocations().map { (.string($0.id), $0.name) }
            case .supplier:
                let suppliers = try await SupplierService.shared.fetchSuppliers().map { (BulkParamValue.string($0.id), $0.name) }
                options = [(.null, "Fără furnizor")] + suppliers
            case .category(_, let kinds):
                var names: [String] = []
                for kind in kinds {
                    for name in try await RecipeService.shared.fetchCategories(kind: kind) where !names.contains(name) {
                        names.append(name)
                    }
                }
                options = [(.null, "Misc (fără categorie)")] + names.map { (.string($0), $0) }
            default:
                break
            }
        } catch let err as APIError {
            loadError = err
        } catch {
            loadError = .networkError(error)
        }
    }
}

extension View {
    /// Adds the "Selectează" / "Gata" toolbar toggle (only when `isEnabled`,
    /// i.e. the user may delete this subject).
    func bulkSelectToolbar(_ selection: BulkSelection, isEnabled: Bool) -> some View {
        modifier(BulkSelectToolbarModifier(selection: selection, isEnabled: isEnabled))
    }

    /// Bottom bar shown while selecting: Toate / N selectate / Acțiuni ▾ / 🗑.
    /// Delete: `onPreview(ids)` (what the cascade would also touch) → confirm
    /// alert with `warning` + the dependents → `onDelete(ids)` (cascade).
    /// Actions: pick one from `actions` (nested menu or picker sheet) → confirm
    /// → `onAction(ids, key, params)`. Both end in a toast or a per-row failure
    /// alert, then `onDone()` (reload) and selection mode exits.
    func bulkSelectBar(
        _ selection: BulkSelection,
        allIds: [String],
        warning: String,
        canDelete: Bool = true,
        actions: [BulkAction] = [],
        onAction: @escaping ([String], String, BulkParams) async throws -> BulkActionResult = { _, _, _ in
            BulkActionResult(done: [], failed: [])
        },
        onPreview: @escaping ([String]) async throws -> BulkDeletePreview,
        onDelete: @escaping ([String]) async throws -> BulkDeleteResult,
        onDone: @escaping () async -> Void
    ) -> some View {
        modifier(BulkSelectBarModifier(
            selection: selection, allIds: allIds, warning: warning, canDelete: canDelete,
            actions: actions, onPreview: onPreview, onDelete: onDelete, onAction: onAction, onDone: onDone))
    }
}

/// Entity-specific confirm texts (shared wording across screens).
enum BulkDeleteWarning {
    static let tasks = "Acțiunea nu poate fi anulată."
    static let orders = "Se șterg definitiv, cu produsele, istoricul, avizul și certificatul. Acțiunea nu poate fi anulată."
    static let transfers = "Transferurile active returnează stocul la sursă. Acțiunea nu poate fi anulată."
    static let rawMaterials = "Se șterg definitiv, împreună cu stocul, mișcările și loturile."
    static let consumables = "Se șterg definitiv, împreună cu stocul, mișcările și loturile."
    static let recipes = "Se șterg definitiv, cu versiunile și istoricul lor. Acțiunea nu poate fi anulată."
    static let sales = "Scăderile confirmate sunt anulate (stocul revine) înainte de ștergere."
}
