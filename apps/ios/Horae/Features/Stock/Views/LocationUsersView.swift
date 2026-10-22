import SwiftUI
import Observation

@Observable
final class LocationUsersViewModel {
    var users: [LocationUserResponse] = []
    var allUsers: [UserResponse] = []
    var isLoading = true
    var error: APIError?
    var showingAddSheet = false

    private let service = LocationService.shared

    func load(locationId: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            users = try await service.fetchLocationUsers(locationId: locationId)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func assignUser(locationId: String, userId: String, isPrimary: Bool = false) async {
        do {
            let body = AssignUserLocationRequest(userId: userId, isPrimary: isPrimary)
            let assigned = try await service.assignUser(to: locationId, body: body)
            users.append(assigned)
            showingAddSheet = false
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func removeUser(locationId: String, userId: String) async {
        do {
            try await service.removeUser(from: locationId, userId: userId)
            users.removeAll { $0.userId == userId }
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

struct LocationUsersView: View {
    let locationId: String
    @State private var viewModel = LocationUsersViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.users.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.users.isEmpty {
                ContentUnavailableView(
                    "Niciun utilizator",
                    systemImage: "person.slash",
                    description: Text("Nu există utilizatori asignați la această locație")
                )
            } else {
                List {
                    ForEach(viewModel.users) { user in
                        HStack {
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                                HStack(spacing: AppTheme.Spacing.xs) {
                                    Text(user.fullName)
                                        .font(.subheadline.weight(.medium))
                                    if user.isPrimary {
                                        Text("Principal")
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(.white)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(.blue, in: Capsule())
                                    }
                                }
                                Text(user.role)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task {
                                    await viewModel.removeUser(locationId: locationId, userId: user.userId)
                                }
                            } label: {
                                Label("Șterge", systemImage: "trash")
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Utilizatori locație")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    viewModel.showingAddSheet = true
                } label: {
                    Image(systemName: "person.badge.plus")
                }
            }
        }
        .task { await viewModel.load(locationId: locationId) }
        .refreshable { await Task { await viewModel.load(locationId: locationId) }.value }
        .errorAlert($viewModel.error)
    }
}

#Preview {
    NavigationStack {
        LocationUsersView(locationId: "preview")
    }
}
