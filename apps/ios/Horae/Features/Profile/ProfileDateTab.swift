import PhotosUI
import SwiftUI

/// Profil › Date — the person's own data (web `date-tab.tsx`).
struct ProfileDateTab: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            MyDataSection()
            ProfilePhotoSection()
            SecuritySection()
            PreferencesSection()
            ToolsSection()
            RiskSection()
            LogoutButton()
        }
    }
}

// MARK: - Datele mele

private struct MyDataSection: View {
    @State private var firstName = AuthManager.shared.currentUser?.firstName ?? ""
    @State private var lastName = AuthManager.shared.currentUser?.lastName ?? ""
    @State private var isSaving = false
    @State private var error: APIError?
    @State private var saved = 0

    private var user: AuthUser? { AuthManager.shared.currentUser }
    /// No "update me" endpoint: `PATCH /users/:id` needs `update User`, so only
    /// admins edit their own name here (same rule as the web).
    private var canEditName: Bool { AuthManager.shared.permissionManager.can(.update, .User) }

    private var trimmed: (String, String) {
        (firstName.trimmingCharacters(in: .whitespaces), lastName.trimmingCharacters(in: .whitespaces))
    }
    private var dirty: Bool {
        trimmed.0 != (user?.firstName ?? "") || trimmed.1 != (user?.lastName ?? "")
    }

    var body: some View {
        ProfileSection("Datele mele", description: "Numele apare pe taskuri, mișcări de stoc și în jurnal.") {
            VStack(alignment: .leading, spacing: 14) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 12) { nameFields }
                    VStack(alignment: .leading, spacing: 14) { nameFields }
                }
                ProfileField(label: "Email de autentificare",
                             hint: "Se schimbă din Echipă & roluri, de către un administrator.") {
                    Text(user?.email ?? "—")
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .profileBox(readOnly: true)
                        .textSelection(.enabled)
                }
                ProfileField(label: "Rol") {
                    Text(user?.role.name ?? "—")
                        .font(AppFont.body(13, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 34)
                        .background(AppTheme.Colors.primary.opacity(0.12), in: Capsule())
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        } footer: {
            ProfileSectionFooter(note: footerNote) {
                if canEditName {
                    ProfileWordButton(title: "Salvează", systemImage: "checkmark", tone: dirty ? .primary : .standard,
                                      isBusy: isSaving, help: "Salvează prenumele și numele") {
                        Task { await save() }
                    }
                    .disabled(!dirty || trimmed.0.isEmpty || trimmed.1.isEmpty)
                }
            }
        }
        .sensoryFeedback(.success, trigger: saved)
        .errorAlert($error)
    }

    @ViewBuilder
    private var nameFields: some View {
        ProfileField(label: "Prenume") { nameInput($firstName, readOnly: user?.firstName, content: .givenName) }
        ProfileField(label: "Nume") { nameInput($lastName, readOnly: user?.lastName, content: .familyName) }
    }

    @ViewBuilder
    private func nameInput(_ text: Binding<String>, readOnly: String?, content: UITextContentType) -> some View {
        if canEditName {
            TextField("", text: text)
                .textContentType(content)
                .autocorrectionDisabled()
                .profileBox()
                .disabled(isSaving)
        } else {
            Text(readOnly ?? "—").profileBox(readOnly: true)
        }
    }

    private var footerNote: String {
        guard canEditName else { return "Numele se schimbă din Echipă & roluri, de către un administrator." }
        return dirty ? "Modificări nesalvate" : "Numele tău, așa cum îl vede echipa"
    }

    @MainActor
    private func save() async {
        guard let user, dirty else { return }
        isSaving = true
        defer { isSaving = false }
        let (first, last) = trimmed
        do {
            try await ProfileService.shared.updateName(userId: user.id, firstName: first, lastName: last)
            AuthManager.shared.currentUser = AuthUser(
                id: user.id, email: user.email, firstName: first, lastName: last,
                role: user.role, permissions: user.permissions, organization: user.organization,
                linkedProviders: user.linkedProviders, hasPassword: user.hasPassword,
                avatarUrl: user.avatarUrl)
            saved += 1
            ToastCenter.shared.show("Datele tale au fost salvate")
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

// MARK: - Poză de profil

private struct ProfilePhotoSection: View {
    @State private var viewModel = ProfileAvatarViewModel()
    @State private var pickerItem: PhotosPickerItem?
    @State private var confirmDelete = false

    var body: some View {
        if let user = AuthManager.shared.currentUser {
            ProfileSection("Poză de profil", description: "Apare în bara laterală și pe taskurile tale.") {
                HStack(spacing: 16) {
                    UserAvatarView(avatarUrl: user.avatarUrl, firstName: user.firstName,
                                   lastName: user.lastName, size: 72)
                        .overlay {
                            if viewModel.isWorking {
                                Circle().fill(.ultraThinMaterial)
                                ProgressView()
                            }
                        }
                        .accessibilityHidden(true)
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) { actions(hasAvatar: user.avatarUrl != nil) }
                        VStack(alignment: .leading, spacing: 8) { actions(hasAvatar: user.avatarUrl != nil) }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task {
                    defer { pickerItem = nil }
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        await viewModel.upload(data)
                    }
                }
            }
            .sensoryFeedback(.success, trigger: viewModel.successCount)
            .confirmationDialog("Ștergi poza de profil?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Șterge poza", role: .destructive) { Task { await viewModel.delete() } }
                Button("Anulează", role: .cancel) {}
            }
            .errorAlert($viewModel.error)
        }
    }

    @ViewBuilder
    private func actions(hasAvatar: Bool) -> some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            Label("Încarcă", systemImage: "arrow.up")
                .font(AppFont.body(14, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 14)
                .frame(minHeight: 44)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isWorking)
        .accessibilityLabel("Încarcă poza de profil")
        .help("Orice imagine — se decupează pătrat și se comprimă automat")
        if hasAvatar {
            ProfileWordButton(title: "Șterge", systemImage: "trash", tone: .danger,
                              help: "Șterge poza de profil") { confirmDelete = true }
                .disabled(viewModel.isWorking)
        }
    }
}

// MARK: - Securitate

private struct SecuritySection: View {
    @State private var sending = false

    var body: some View {
        ProfileSection("Securitate", description: "Parola și conturile cu care te poți autentifica fără parolă.") {
            ProfileRow(title: "Parolă", subtitle: "Îți trimitem un link pe email, valabil 30 de minute") {
                ProfileGlyph(systemImage: "key")
            } trailing: {
                ProfileWordButton(title: "Schimbă parola", systemImage: "envelope", isBusy: sending,
                                  help: "Trimite linkul de schimbare pe emailul tău") {
                    Task { await sendReset() }
                }
            }
            LinkedAccountRows()
        }
    }

    @MainActor
    private func sendReset() async {
        guard let email = AuthManager.shared.currentUser?.email else { return }
        sending = true
        defer { sending = false }
        do {
            try await AuthManager.shared.requestPasswordReset(email: email)
            ToastCenter.shared.show("Ți-am trimis un email cu linkul de schimbare a parolei")
        } catch {
            ToastCenter.shared.show("Nu am putut trimite emailul. Încearcă din nou.")
        }
    }
}

// MARK: - Preferințe

private struct PreferencesSection: View {
    @State private var tutorial = TutorialCenter.shared
    private var store: AppSchemeStore { .shared }

    var body: some View {
        ProfileSection("Preferințe", description: "Doar pentru contul tău, pe acest dispozitiv.") {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Temă").font(AppFont.body(15, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.label)
                    Spacer()
                    Text("Acum: \(store.scheme.name) · \(store.scheme.kindLabel.lowercased())")
                        .font(AppFont.body(12))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
                Text("Trei scheme luminoase, trei întunecate — fiecare cu accentul ei.")
                    .font(AppFont.body(12.5))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                SchemePickerGrid()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .overlay(alignment: .top) { ProfileDivider() }

            ProfileRow("Tutorial", subtitle: "Sfaturi pe ecran cât explorezi aplicația") {
                Toggle("Tutorial", isOn: Binding(get: { tutorial.enabled }, set: { tutorial.setEnabled($0) }))
                    .labelsHidden()
                    .tint(AppTheme.Colors.primary)
                    .accessibilityLabel("Tutorial")
                    .tutorialAnchor(id: "profile.tutorial")
            }
            if tutorial.enabled && !tutorial.dismissedSteps.isEmpty {
                ProfileRow("Sfaturi ascunse", subtitle: "Le poți vedea din nou") {
                    ProfileWordButton(title: "Reafișează", systemImage: "arrow.counterclockwise") {
                        tutorial.resetDismissed()
                        ToastCenter.shared.show("Sfaturile vor apărea din nou")
                    }
                }
            }
        }
        .task { tutorial.syncCurrentUser() }
    }
}

// MARK: - Unelte

/// Screens that lived in the old Setări list and have no other entry on
/// iPhone (no sidebar there).
private struct ToolsSection: View {
    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    var body: some View {
        ProfileSection("Unelte", description: "Notificări, ajutor și rapoarte.") {
            linkRow("Notificări", "Comenzi noi, stoc scăzut, taskuri", "bell", .notificationInbox)
            linkRow("Centru de ajutor", "Ghiduri pas cu pas", "questionmark.circle", .helpCenter)
            if permissions.can(.read, .Task) {
                linkRow("Calendar producție", "Taskurile pe zile", "calendar", .productionCalendar)
            }
            if permissions.isAdmin || permissions.can(.read, .Recipe) && permissions.can(.update, .Recipe) {
                linkRow("Statistici", "Vânzări, producție, marje", "chart.bar", .analyticsDashboard)
            }
            if permissions.isAdmin || permissions.can(.update, .Recipe) {
                linkRow("Prețuri", "Prețuri de achiziție în timp", "tag", .priceHistory)
            }
        }
    }

    private func linkRow(_ title: String, _ subtitle: String, _ icon: String, _ route: Route) -> some View {
        NavigationLink(value: route) {
            ProfileRow(title: title, subtitle: subtitle) {
                ProfileGlyph(systemImage: icon)
            } trailing: {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Zonă de risc

private struct RiskSection: View {
    @State private var showConfirm = false
    @State private var password = ""
    @State private var isDeleting = false
    @State private var errorMessage: String?

    var body: some View {
        ProfileSection("Zonă de risc", description: "Acțiune definitivă — nu se poate anula.", tone: .danger) {
            ProfileRow("Șterge contul meu",
                       subtitle: "Datele personale se anonimizează; taskurile și mișcările rămân în istoric, fără numele tău.",
                       titleColor: AppTheme.Status.fg(.danger)) {
                ProfileWordButton(title: "Șterge contul", systemImage: "trash", tone: .danger, isBusy: isDeleting,
                                  help: "Ștergere definitivă — îți cerem parola") {
                    password = ""
                    showConfirm = true
                }
            }
        }
        .alert("Șterge definitiv contul", isPresented: $showConfirm) {
            SecureField("Parola curentă", text: $password)
                .textContentType(.password)
            Button("Șterge contul", role: .destructive) { Task { await delete() } }
                .disabled(password.isEmpty || isDeleting)
            Button("Renunță", role: .cancel) { password = "" }
        } message: {
            Text("Contul tău va fi dezactivat, datele personale anonimizate și vei fi deconectat de pe toate dispozitivele. Introdu parola curentă pentru a confirma.")
        }
        .alert("Nu am putut șterge contul",
               isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    @MainActor
    private func delete() async {
        isDeleting = true
        defer { isDeleting = false; password = "" }
        do {
            try await AuthManager.shared.deleteAccount(password: password)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? "Încearcă din nou."
        }
    }
}

// MARK: - Deconectare

private struct LogoutButton: View {
    @State private var confirm = false

    var body: some View {
        Button { confirm = true } label: {
            Text("Deconectare")
                .font(AppFont.body(15, weight: .bold))
                .foregroundStyle(AppTheme.Status.fg(.danger))
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(AppTheme.Colors.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .alert("Sigur vrei să te deconectezi?", isPresented: $confirm) {
            Button("Deconectare", role: .destructive) {
                WebSocketManager.shared.disconnect()
                AuthManager.shared.logout()
            }
            Button("Anulează", role: .cancel) {}
        } message: {
            Text("Va trebui să te autentifici din nou.")
        }
    }
}

#Preview("Profil › Date") {
    NavigationStack {
        ScrollView { ProfileDateTab().padding() }
            .background(AppTheme.Colors.appBackground)
    }
}
