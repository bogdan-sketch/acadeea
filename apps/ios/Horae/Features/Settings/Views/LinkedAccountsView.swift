import SwiftUI
import AuthenticationServices

/// Apple / Google rows (Conectat / Neconectat + Conectează / Deconectează).
/// Embedded in Profil › Date › Securitate; `LinkedAccountsView` shows the same
/// rows as a standalone screen for the `.linkedAccounts` route.
struct LinkedAccountRows: View {
    @State private var viewModel = LinkedAccountsViewModel()
    @State private var pendingUnlink: String?
    @State private var apple = AppleIDCoordinator()

    var body: some View {
        Group {
            row(name: "Apple", icon: "apple.logo", linked: viewModel.appleLinked, provider: "apple") {
                apple.start(configure: { viewModel.configureAppleRequest($0) },
                            completion: { viewModel.handleAppleCompletion($0) })
            }
            if viewModel.isGoogleConfigured {
                row(name: "Google", icon: "g.circle", linked: viewModel.googleLinked, provider: "google") {
                    viewModel.linkGoogle()
                }
            }
        }
        .disabled(viewModel.isBusy)
        .task { await viewModel.load() }
        .alert(
            "Eroare",
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .confirmationDialog(
            "Deconectezi acest cont?",
            isPresented: Binding(
                get: { pendingUnlink != nil },
                set: { if !$0 { pendingUnlink = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Deconectează", role: .destructive) {
                if let provider = pendingUnlink { viewModel.unlink(provider) }
                pendingUnlink = nil
            }
            Button("Anulează", role: .cancel) { pendingUnlink = nil }
        } message: {
            Text("Nu poți deconecta ultima metodă de autentificare.")
        }
    }

    private func row(
        name: String, icon: String, linked: Bool, provider: String, link: @escaping () -> Void
    ) -> some View {
        ProfileRow(title: name, subtitle: linked ? "Conectat" : "Neconectat · intri fără parolă") {
            ProfileGlyph(systemImage: icon)
        } trailing: {
            if linked {
                ProfileWordButton(title: "Deconectează", systemImage: "link", tone: .danger,
                                  help: "Deconectează contul \(name)") {
                    pendingUnlink = provider
                }
                .disabled(!viewModel.canUnlink(provider))
            } else {
                ProfileWordButton(title: "Conectează", systemImage: "link", isBusy: viewModel.isBusy,
                                  help: "Conectează cu \(name)", action: link)
            }
        }
    }
}

/// Standalone "Conturi conectate" screen (route `.linkedAccounts`).
struct LinkedAccountsView: View {
    var body: some View {
        ScrollView {
            ProfileSection("Conturi conectate",
                           description: "Conectează un cont Apple sau Google ca să te autentifici mai rapid.") {
                LinkedAccountRows()
            }
            .padding(16)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .background(AppTheme.Colors.appBackground.ignoresSafeArea())
        .navigationTitle("Conturi conectate")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        LinkedAccountsView()
    }
}
