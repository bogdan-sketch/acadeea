import SwiftUI
import Observation

@Observable
final class RoleDetailViewModel {
    var role: RoleResponse?
    var subjects: [SubjectMeta] = []
    var isLoading = false
    var isSaving = false
    var isDeleting = false
    var error: APIError?
    var didDelete = false

    /// Mutable permission state: [subject: Set<action>]
    var permissionGrid: [String: Set<String>] = [:]

    private let roleId: String
    private let service = RoleService.shared

    init(roleId: String) {
        self.roleId = roleId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let roleResult = service.fetchRole(id: roleId)
            async let subjectsResult = service.fetchSubjects()
            role = try await roleResult
            subjects = try await subjectsResult

            // Build grid from current permissions
            permissionGrid = [:]
            for perm in role?.permissions ?? [] {
                permissionGrid[perm.subject, default: []].insert(perm.action)
            }
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func togglePermission(subject: String, action: String) {
        if permissionGrid[subject, default: []].contains(action) {
            permissionGrid[subject, default: []].remove(action)
        } else {
            permissionGrid[subject, default: []].insert(action)
        }
    }

    func hasPermission(subject: String, action: String) -> Bool {
        permissionGrid[subject, default: []].contains(action)
    }

    func savePermissions() async {
        isSaving = true
        defer { isSaving = false }

        var rules: [PermissionRule] = []
        for (subject, actions) in permissionGrid {
            for action in actions {
                rules.append(PermissionRule(action: action, subject: subject))
            }
        }

        do {
            role = try await service.setPermissions(roleId: roleId, permissions: rules)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func deleteRole() async {
        isDeleting = true
        defer { isDeleting = false }

        do {
            try await service.deleteRole(id: roleId)
            didDelete = true
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

struct RoleDetailView: View {
    let roleId: String
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: RoleDetailViewModel

    init(roleId: String) {
        self.roleId = roleId
        self._viewModel = State(initialValue: RoleDetailViewModel(roleId: roleId))
    }

    var body: some View {
        Group {
            if let role = viewModel.role {
                roleContent(role)
            } else if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                EmptyStateView(title: "Rol negasit", systemImage: "person.badge.key")
            }
        }
        .navigationTitle(viewModel.role?.name ?? "Rol")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !(viewModel.role?.isSystem ?? true) {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await viewModel.savePermissions() }
                    } label: {
                        if viewModel.isSaving {
                            ProgressView()
                        } else {
                            Text("Salveaza")
                        }
                    }
                    .disabled(viewModel.isSaving)
                }
            }
        }
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
        .onChange(of: viewModel.didDelete) {
            if viewModel.didDelete {
                dismiss()
            }
        }
    }

    @ViewBuilder
    private func roleContent(_ role: RoleResponse) -> some View {
        List {
            // Info
            Section("Informatii") {
                LabeledContent("Slug", value: role.slug)
                if let desc = role.description, !desc.isEmpty {
                    LabeledContent("Descriere", value: desc)
                }
                LabeledContent("Utilizatori", value: "\(role.userCount)")
                if role.isSystem {
                    Label("Rol de sistem — nu poate fi sters sau modificat", systemImage: "lock.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }

            // Permission grid
            if !role.isSystem {
                Section {
                    if viewModel.subjects.isEmpty {
                        Text("Se incarca...")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.subjects) { meta in
                            DisclosureGroup(meta.subject) {
                                ForEach(meta.actions, id: \.self) { action in
                                    Toggle(action, isOn: Binding(
                                        get: { viewModel.hasPermission(subject: meta.subject, action: action) },
                                        set: { _ in viewModel.togglePermission(subject: meta.subject, action: action) }
                                    ))
                                }
                            }
                        }
                    }
                } header: {
                    Text("Permisiuni").tutorialAnchor(id: "users.roles.permissions")
                }
            } else {
                Section("Permisiuni") {
                    Label("manage all — acces total", systemImage: "checkmark.shield.fill")
                        .foregroundStyle(.green)
                }
            }

            // Delete button (non-system roles only)
            if !role.isSystem {
                Section {
                    Button(role: .destructive) {
                        Task {
                            await viewModel.deleteRole()
                        }
                    } label: {
                        HStack {
                            Spacer()
                            if viewModel.isDeleting {
                                ProgressView()
                            } else {
                                Label("Sterge rolul", systemImage: "trash")
                            }
                            Spacer()
                        }
                    }
                    .disabled(viewModel.isDeleting)
                }
            }
        }
    }
}
