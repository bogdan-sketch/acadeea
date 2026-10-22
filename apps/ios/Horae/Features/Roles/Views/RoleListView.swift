import SwiftUI
import Observation

@Observable
final class RoleListViewModel {
    var roles: [RoleResponse] = []
    var isLoading = false
    var error: APIError?

    private let service = RoleService.shared

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            roles = try await service.fetchRoles()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func deleteRole(_ role: RoleResponse) async {
        do {
            try await service.deleteRole(id: role.id)
            roles.removeAll { $0.id == role.id }
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

struct RoleListView: View {
    @State private var viewModel = RoleListViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.roles.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.roles.isEmpty {
                EmptyStateView(title: "Niciun rol", systemImage: "person.badge.key")
            } else {
                List {
                    ForEach(viewModel.roles) { role in
                        NavigationLink(value: Route.roleDetail(id: role.id)) {
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                                HStack {
                                    Text(role.name)
                                        .font(.body.bold())
                                    if role.isSystem {
                                        Text("Sistem")
                                            .font(.caption2.bold())
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Color.orange.opacity(0.15))
                                            .clipShape(Capsule())
                                    }
                                    Spacer()
                                    Text("\(role.userCount) utilizatori")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if let desc = role.description, !desc.isEmpty {
                                    Text(desc)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                                Text("\(role.permissions.count) permisiuni")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .swipeActions(edge: .trailing) {
                            if !role.isSystem {
                                Button(role: .destructive) {
                                    Task { await viewModel.deleteRole(role) }
                                } label: {
                                    Label("Sterge", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Roluri")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink(value: Route.roleCreate) {
                    Image(systemName: "plus")
                }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await Task { await viewModel.load() }.value }
        .errorAlert($viewModel.error)
    }
}
