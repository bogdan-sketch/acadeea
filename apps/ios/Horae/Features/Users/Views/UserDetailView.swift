import SwiftUI

struct UserDetailView: View {
    let userId: String
    @State private var viewModel: UserDetailViewModel
    @State private var showRolePicker = false
    @State private var showDeactivateConfirm = false

    init(userId: String) {
        self.userId = userId
        self._viewModel = State(initialValue: UserDetailViewModel(userId: userId))
    }

    var body: some View {
        Group {
            if let user = viewModel.user {
                userContent(user)
            } else if viewModel.isLoading {
                ProgressView()
            } else {
                EmptyStateView(title: "Utilizator negasit", systemImage: "person.slash")
            }
        }
        .navigationTitle(viewModel.user?.fullName ?? "Utilizator")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
        .confirmationDialog("Schimbă rol", isPresented: $showRolePicker) {
            ForEach(viewModel.roles) { role in
                Button(role.name) {
                    Task { await viewModel.changeRole(to: role.id) }
                }
            }
        }
        .alert("Dezactivează utilizator?", isPresented: $showDeactivateConfirm) {
            Button("Dezactivează", role: .destructive) {
                Task { await viewModel.deactivate() }
            }
            Button("Renunta", role: .cancel) {}
        } message: {
            Text("Utilizatorul nu va mai putea sa se autentifice.")
        }
    }

    @ViewBuilder
    private func userContent(_ user: UserResponse) -> some View {
        List {
            Section("Informații") {
                LabeledContent("Email", value: user.email)
                LabeledContent("Prenume", value: user.firstName)
                LabeledContent("Nume", value: user.lastName)
                LabeledContent("Rol", value: user.roleName)
                LabeledContent("Status", value: user.isActive ? "Activ" : "Inactiv")
                LabeledContent("Creat", value: user.createdAt.formatted(date: .long, time: .shortened))
            }

            Section("Acțiuni") {
                Button {
                    showRolePicker = true
                } label: {
                    HStack {
                        Image(systemName: "person.badge.key")
                            .foregroundStyle(AppTheme.Colors.primaryText)
                        Text("Schimbă rol")
                            .foregroundStyle(Color.primary)
                    }
                }

                if user.isActive {
                    Button(role: .destructive) {
                        showDeactivateConfirm = true
                    } label: {
                        Label("Dezactivează", systemImage: "person.slash")
                    }
                    .tutorialAnchor(id: "users.roles.deactivate")
                } else {
                    Button {
                        Task { await viewModel.reactivate() }
                    } label: {
                        Label("Reactivează", systemImage: "person.badge.plus")
                            .foregroundStyle(.green)
                    }
                }
            }
        }
    }
}
