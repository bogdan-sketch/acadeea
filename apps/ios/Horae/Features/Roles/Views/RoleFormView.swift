import SwiftUI

enum RoleFormMode: Hashable {
    case create
    case edit(String) // role ID
}

// MARK: - Subject Display Metadata

private struct SubjectDisplayInfo {
    let name: String
    let icon: String
    let actionDescriptions: [String: String]
}

private let subjectDisplayMap: [String: SubjectDisplayInfo] = [
    "Recipe": SubjectDisplayInfo(
        name: "Retete",
        icon: "book.fill",
        actionDescriptions: [
            "read": "Vizualizeaza lista de retete si detaliile fiecareia",
            "create": "Creeaza retete noi cu ingrediente si pasi",
            "update": "Modifica retete existente, ingrediente si preturi",
            "delete": "Sterge retete din sistem",
        ]
    ),
    "RecipeCost": SubjectDisplayInfo(
        name: "Cost productie retete",
        icon: "banknote",
        actionDescriptions: [
            "read": "Vede costul de productie si pretul/marja retetelor",
        ]
    ),
    "Task": SubjectDisplayInfo(
        name: "Task-uri",
        icon: "checklist",
        actionDescriptions: [
            "read": "Vizualizeaza task-urile de productie",
            "create": "Creeaza task-uri noi de productie",
            "update": "Modifica si actualizeaza statusul task-urilor",
            "delete": "Sterge task-uri din planificare",
        ]
    ),
    "Order": SubjectDisplayInfo(
        name: "Comenzi",
        icon: "cart.fill",
        actionDescriptions: [
            "read": "Vizualizeaza comenzile clientilor",
            "create": "Inregistreaza comenzi noi",
            "update": "Modifica statusul si detaliile comenzilor",
            "delete": "Anuleaza sau sterge comenzi",
        ]
    ),
    "OrderItem": SubjectDisplayInfo(
        name: "Articole comanda",
        icon: "list.bullet.rectangle",
        actionDescriptions: [
            "read": "Vizualizeaza produsele din comenzi",
            "create": "Adauga produse la comenzi",
            "update": "Modifica cantitatile si statusul articolelor",
            "delete": "Sterge articole din comenzi",
        ]
    ),
    "RawMaterial": SubjectDisplayInfo(
        name: "Materii prime",
        icon: "leaf.fill",
        actionDescriptions: [
            "read": "Vizualizeaza stocul de materii prime",
            "create": "Adauga materii prime noi in sistem",
            "update": "Modifica detaliile si stocul materiilor prime",
            "delete": "Sterge materii prime din catalog",
        ]
    ),
    "Consumable": SubjectDisplayInfo(
        name: "Consumabile",
        icon: "shippingbox.fill",
        actionDescriptions: [
            "read": "Vizualizeaza stocul de consumabile",
            "create": "Adauga consumabile noi (cutii, pungi, etc.)",
            "update": "Modifica detaliile si stocul consumabilelor",
            "delete": "Sterge consumabile din catalog",
        ]
    ),
    "StockMovement": SubjectDisplayInfo(
        name: "Miscari stoc",
        icon: "arrow.left.arrow.right",
        actionDescriptions: [
            "read": "Vizualizeaza istoricul miscarilor de stoc",
            "create": "Inregistreaza intrari si iesiri de stoc",
            "update": "Corecteaza miscarile de stoc",
            "delete": "Sterge inregistrari de miscari",
        ]
    ),
    "StockReservation": SubjectDisplayInfo(
        name: "Rezervari stoc",
        icon: "lock.fill",
        actionDescriptions: [
            "read": "Vizualizeaza rezervarile de stoc pentru task-uri",
            "create": "Creeaza rezervari de stoc",
            "update": "Modifica rezervarile existente",
            "delete": "Anuleaza rezervari de stoc",
        ]
    ),
    "Location": SubjectDisplayInfo(
        name: "Locatii",
        icon: "mappin.and.ellipse",
        actionDescriptions: [
            "read": "Vizualizeaza locatiile (laboratoare, depozite, etc.)",
            "create": "Adauga locatii noi",
            "update": "Modifica detaliile locatiilor",
            "delete": "Sterge locatii din sistem",
        ]
    ),
    "StockTransfer": SubjectDisplayInfo(
        name: "Transferuri stoc",
        icon: "arrow.triangle.swap",
        actionDescriptions: [
            "read": "Vizualizeaza transferurile intre locatii",
            "create": "Initiaza transferuri de stoc",
            "update": "Aproba sau modifica transferuri",
            "delete": "Anuleaza transferuri",
        ]
    ),
    "User": SubjectDisplayInfo(
        name: "Utilizatori",
        icon: "person.2.fill",
        actionDescriptions: [
            "read": "Vizualizeaza lista de utilizatori",
            "create": "Creeaza conturi de utilizator noi",
            "update": "Modifica datele utilizatorilor",
            "delete": "Dezactiveaza sau sterge utilizatori",
        ]
    ),
    "UserInvitation": SubjectDisplayInfo(
        name: "Invitatii",
        icon: "envelope.fill",
        actionDescriptions: [
            "read": "Vizualizeaza invitatiile trimise",
            "create": "Trimite invitatii noi prin email",
            "update": "Modifica invitatiile existente",
            "delete": "Revoca invitatii",
        ]
    ),
    "DeliveryNote": SubjectDisplayInfo(
        name: "Avize livrare",
        icon: "doc.text.fill",
        actionDescriptions: [
            "read": "Vizualizeaza avizele de livrare",
            "create": "Genereaza avize noi",
            "update": "Modifica avizele de livrare",
            "delete": "Sterge avize",
        ]
    ),
    "Organization": SubjectDisplayInfo(
        name: "Organizatie",
        icon: "building.2.fill",
        actionDescriptions: [
            "read": "Vizualizeaza datele organizatiei",
            "create": "Creeaza organizatii",
            "update": "Modifica setarile organizatiei (branding, etc.)",
            "delete": "Sterge organizatia",
        ]
    ),
    "Role": SubjectDisplayInfo(
        name: "Roluri",
        icon: "person.badge.key",
        actionDescriptions: [
            "read": "Vizualizeaza rolurile existente",
            "create": "Creeaza roluri noi",
            "update": "Modifica permisiunile rolurilor",
            "delete": "Sterge roluri",
        ]
    ),
]

private let actionDisplayNames: [String: String] = [
    "read": "Vizualizare",
    "create": "Creare",
    "update": "Modificare",
    "delete": "Stergere",
]

private let actionIcons: [String: String] = [
    "read": "eye",
    "create": "plus.circle",
    "update": "pencil",
    "delete": "trash",
]

// MARK: - Friendly access level (preset over the raw action grid)

private let allActions = ["read", "create", "update", "delete"]

enum AccessLevel: String, CaseIterable, Identifiable {
    case none, view, edit, full, custom
    var id: String { rawValue }

    /// Presets the picker offers (custom is derived, never picked directly).
    static var presets: [AccessLevel] { [.none, .view, .edit, .full] }

    var label: String {
        switch self {
        case .none: "Fara acces"
        case .view: "Vizualizare"
        case .edit: "Editare"
        case .full: "Gestionare completa"
        case .custom: "Personalizat"
        }
    }

    var color: Color {
        switch self {
        case .none: .secondary
        case .view: .blue
        case .edit: .orange
        case .full: .green
        case .custom: .purple
        }
    }

    /// The concrete action set this preset represents.
    var actions: Set<String> {
        switch self {
        case .none: []
        case .view: ["read"]
        case .edit: ["read", "create", "update"]
        case .full: Set(allActions)
        case .custom: []
        }
    }

    /// Derive the preset that matches a set of actions (or .custom).
    static func from(_ actions: Set<String>) -> AccessLevel {
        for preset in presets where preset.actions == actions { return preset }
        return .custom
    }
}

// MARK: - View

struct RoleFormView: View {
    let mode: RoleFormMode

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var isLoading = false
    @State private var isSavingPermissions = false
    @State private var error: APIError?

    // Permissions — preset level per module, with optional per-action editing.
    @State private var subjects: [SubjectMeta] = []
    @State private var permActions: [String: Set<String>] = [:]
    @State private var advanced = false

    private let service = RoleService.shared

    var body: some View {
        Form {
            Section {
                TextField("Numele rolului", text: $name)
                TextField("Descriere (optional)", text: $description)
            } header: {
                Text("Informatii rol")
            }

            if subjects.isEmpty && !isLoading {
                Section("Permisiuni") {
                    ProgressView()
                }
            } else {
                Section {
                    Toggle("Mod avansat (pe actiuni)", isOn: $advanced)
                }

                Section {
                    ForEach(subjects) { meta in
                        permissionRow(for: meta)
                    }
                } header: {
                    Text("Permisiuni")
                } footer: {
                    Text("Pentru fiecare sectiune alegi un nivel: Fara acces, Vizualizare (doar vede), "
                        + "Editare (vede + adauga/modifica) sau Gestionare completa (inclusiv stergere). "
                        + "Activeaza Mod avansat pentru control fin pe actiuni. "
                        + "La Task-uri, Vizualizare = userul vede doar task-urile lui; Gestionare = vede toate.")
                }
            }
        }
        .navigationTitle(isCreate ? "Rol nou" : "Editeaza rol")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(isCreate ? "Creeaza" : "Salveaza") {
                    Task { await save() }
                }
                .disabled(name.isEmpty || isLoading || isSavingPermissions)
            }
        }
        .errorAlert($error)
        .task { await loadData() }
    }

    // MARK: - Helpers

    private var isCreate: Bool {
        if case .create = mode { return true }
        return false
    }

    // MARK: - Permission row

    @ViewBuilder
    private func permissionRow(for meta: SubjectMeta) -> some View {
        let info = subjectDisplayMap[meta.subject]
        let actions = permActions[meta.subject] ?? []
        let level = AccessLevel.from(actions)

        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                Label(info?.name ?? meta.subject, systemImage: info?.icon ?? "square.grid.2x2")
                Spacer()
                if advanced {
                    Text(level.label)
                        .font(.caption)
                        .foregroundStyle(level.color)
                } else {
                    levelMenu(for: meta, current: level)
                }
            }

            if advanced {
                ForEach(allActions, id: \.self) { action in
                    Toggle(isOn: actionBinding(subject: meta.subject, action: action)) {
                        Text(actionDisplayNames[action] ?? action)
                            .font(.subheadline)
                    }
                    .padding(.leading, 28)
                }
            }
        }
    }

    private func levelMenu(for meta: SubjectMeta, current: AccessLevel) -> some View {
        Menu {
            ForEach(AccessLevel.presets) { lvl in
                Button {
                    permActions[meta.subject] = lvl.actions
                } label: {
                    if lvl == current {
                        Label(lvl.label, systemImage: "checkmark")
                    } else {
                        Text(lvl.label)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(current.label)
                Image(systemName: "chevron.up.chevron.down").font(.caption2)
            }
            .font(.subheadline)
            .foregroundStyle(current.color)
        }
    }

    private func actionBinding(subject: String, action: String) -> Binding<Bool> {
        Binding(
            get: { permActions[subject, default: []].contains(action) },
            set: { on in
                if on { permActions[subject, default: []].insert(action) }
                else { permActions[subject, default: []].remove(action) }
            }
        )
    }

    private func loadData() async {
        isLoading = true
        defer { isLoading = false }

        do {
            subjects = try await service.fetchSubjects()

            if case .edit(let id) = mode {
                let role = try await service.fetchRole(id: id)
                name = role.name
                description = role.description ?? ""
                for perm in role.permissions {
                    // 'manage' is shorthand for every action.
                    if perm.action == "manage" {
                        permActions[perm.subject] = Set(allActions)
                    } else {
                        permActions[perm.subject, default: []].insert(perm.action)
                    }
                }
            }
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    private func save() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let roleId: String

            if case .create = mode {
                let created = try await service.createRole(
                    name: name,
                    description: description.isEmpty ? nil : description
                )
                roleId = created.id
            } else if case .edit(let id) = mode {
                _ = try await service.updateRole(
                    id: id,
                    name: name,
                    description: description.isEmpty ? nil : description
                )
                roleId = id
            } else {
                return
            }

            // Build action rules; collapse a full set to a single 'manage'.
            var rules: [PermissionRule] = []
            for meta in subjects {
                let actions = permActions[meta.subject] ?? []
                if actions.isEmpty { continue }
                if AccessLevel.from(actions) == .full {
                    rules.append(PermissionRule(action: "manage", subject: meta.subject))
                } else {
                    for action in actions {
                        rules.append(PermissionRule(action: action, subject: meta.subject))
                    }
                }
            }

            isSavingPermissions = true
            _ = try await service.setPermissions(roleId: roleId, permissions: rules)
            isSavingPermissions = false

            dismiss()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
