import SwiftUI

struct InviteUserSheet: View {
    let onInvited: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var selectedRoleId: String = ""
    @State private var roles: [RoleResponse] = []
    @State private var isLoading = false
    @State private var error: APIError?

    var body: some View {
        NavigationStack {
            Form {
                Section("Detalii invitație") {
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)
                        .tutorialAnchor(id: "users.roles.invite")

                    Picker("Rol", selection: $selectedRoleId) {
                        Text("Selectează rol").tag("")
                        ForEach(roles) { role in
                            Text(role.name).tag(role.id)
                        }
                    }
                }
            }
            .navigationTitle("Invită utilizator")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Renunta") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Trimite") {
                        Task { await sendInvite() }
                    }
                    .disabled(email.isEmpty || selectedRoleId.isEmpty || isLoading)
                }
            }
            .errorAlert($error)
            .task { await loadRoles() }
        }
    }

    private func loadRoles() async {
        do {
            roles = try await UserService.shared.fetchRoles()
            // Pre-select first non-system role if available
            if selectedRoleId.isEmpty, let first = roles.first(where: { !$0.isSystem }) {
                selectedRoleId = first.id
            }
        } catch {
            // Roles will just be empty — not a critical failure
        }
    }

    private func sendInvite() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let body = InviteUserRequest(email: email, roleId: selectedRoleId)
            _ = try await UserService.shared.inviteUser(body)
            onInvited()
            dismiss()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
