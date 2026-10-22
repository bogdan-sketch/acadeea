import SwiftUI

struct UserListView: View {
    @State private var viewModel = UserListViewModel()
    @State private var showInviteSheet = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("Tab", selection: $viewModel.selectedTab) {
                ForEach(UserListTab.allCases, id: \.self) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.sm)
            .onChange(of: viewModel.selectedTab) {
                Task { await viewModel.loadInitial() }
            }

            Group {
                if viewModel.selectedTab == .invited {
                    invitationsContent
                } else {
                    usersContent
                }
            }
        }
        .navigationTitle("Utilizatori")
        .searchable(text: $viewModel.search, prompt: "Caută utilizatori")
        .onChange(of: viewModel.search) {
            viewModel.searchChanged()
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showInviteSheet = true
                } label: {
                    Image(systemName: "person.badge.plus")
                }
            }
        }
        .sheet(isPresented: $showInviteSheet) {
            InviteUserSheet {
                Task { await viewModel.loadInitial() }
            }
            // A sheet is its own presentation host: anchor preferences never
            // reach the AppTabView overlay, so hints inside it need their own.
            .tutorialOverlay()
        }
        .task { await viewModel.loadInitial() }
        .errorAlert($viewModel.error)
    }

    // MARK: - Users List

    @ViewBuilder
    private var usersContent: some View {
        if viewModel.users.isEmpty && !viewModel.isLoading {
            EmptyStateView(title: "Niciun utilizator", systemImage: "person.slash")
        } else {
            List {
                ForEach(viewModel.users) { user in
                    NavigationLink(value: Route.userDetail(id: user.id)) {
                        HStack(spacing: AppTheme.Spacing.md) {
                        UserAvatarView(
                            avatarUrl: user.avatarUrl,
                            firstName: user.firstName,
                            lastName: user.lastName,
                            size: 40
                        )
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                            Text(user.fullName)
                                .font(.body.bold())
                            HStack {
                                Text(user.email)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Text(user.roleName)
                                    .font(.caption.bold())
                                    .padding(.horizontal, AppTheme.Spacing.sm)
                                    .padding(.vertical, 2)
                                    .background(Color.accentColor.opacity(0.12))
                                    .clipShape(Capsule())
                            }
                        }
                        }
                    }
                    .onAppear {
                        if viewModel.users.isNearEnd(user) {
                            Task { await viewModel.loadMore() }
                        }
                    }
                }

                if viewModel.isLoading {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
        }
    }

    // MARK: - Invitations List

    @ViewBuilder
    private var invitationsContent: some View {
        if viewModel.invitations.isEmpty && !viewModel.isLoading {
            EmptyStateView(title: "Nicio invitație", systemImage: "envelope.badge")
        } else {
            List {
                ForEach(viewModel.invitations) { invitation in
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                        Text(invitation.email)
                            .font(.body.bold())
                        HStack {
                            if let roleName = invitation.role?.name {
                                Text(roleName)
                                    .font(.caption.bold())
                                    .padding(.horizontal, AppTheme.Spacing.sm)
                                    .padding(.vertical, 2)
                                    .background(Color.accentColor.opacity(0.12))
                                    .clipShape(Capsule())
                            }
                            Spacer()
                            invitationStatusBadge(invitation)
                        }
                    }
                }

                if viewModel.isLoading {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
        }
    }

    @ViewBuilder
    private func invitationStatusBadge(_ invitation: InvitationResponse) -> some View {
        if invitation.acceptedAt != nil {
            Label("Acceptată", systemImage: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.green)
        } else if invitation.expiresAt < Date() {
            Label("Expirată", systemImage: "clock.badge.xmark")
                .font(.caption)
                .foregroundStyle(.red)
        } else {
            Label("În așteptare", systemImage: "clock")
                .font(.caption)
                .foregroundStyle(.orange)
        }
    }
}
