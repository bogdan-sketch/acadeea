import PhotosUI
import SwiftUI

/// Profil › Setări › Identitate — the company logo, and only that. There is
/// no per-company branding any more: the accent and the fonts come from the
/// six designed schemes. One transparent PNG, used in the sidebar and on the
/// printed documents (same file on dark schemes), like the web `LogoCard`.
struct OrgLogoCard: View {
    @State private var pickerItem: PhotosPickerItem?
    @State private var isWorking = false
    @State private var confirmRemove = false
    @State private var error: APIError?

    private var branding: BrandingManager { .shared }
    private var logo: Image? { branding.logo(for: .light) ?? branding.logo(for: .dark) }

    var body: some View {
        ProfileSection("Identitate", description: "Logo-ul firmei: bara laterală și avizele.") {
            HStack(spacing: 14) {
                preview
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { actions }
                    VStack(alignment: .leading, spacing: 8) { actions }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        } footer: {
            ProfileSectionFooter(note: "PNG transparent · fără logo se afișează inițiala firmei") { EmptyView() }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await upload(item) }
        }
        .confirmationDialog("Ștergi logo-ul?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Șterge logo-ul", role: .destructive) { Task { await remove() } }
            Button("Anulează", role: .cancel) {}
        } message: {
            Text("Se va afișa inițiala firmei.")
        }
        .errorAlert($error)
    }

    private var preview: some View {
        Group {
            if let logo {
                logo.resizable().scaledToFit().padding(8)
            } else {
                Text(String(branding.organizationName.prefix(1)).uppercased())
                    .font(AppFont.title(26))
                    .foregroundStyle(AppTheme.Colors.primaryText)
            }
        }
        .frame(width: 72, height: 72)
        .background(AppTheme.Colors.appBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .strokeBorder(AppTheme.Colors.border, lineWidth: 1))
        .overlay { if isWorking { ProgressView() } }
        .accessibilityLabel(logo == nil ? "Fără logo" : "Logo-ul firmei")
    }

    @ViewBuilder
    private var actions: some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            Label("Încarcă logo", systemImage: "arrow.up")
                .font(AppFont.body(14, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 14)
                .frame(minHeight: 44)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isWorking)
        .accessibilityLabel("Încarcă logo")
        .help("Un PNG transparent")
        if logo != nil {
            ProfileWordButton(title: "Șterge", systemImage: "trash", tone: .danger,
                              help: "Șterge logo-ul — revine la inițiala firmei") { confirmRemove = true }
                .disabled(isWorking)
        }
    }

    @MainActor
    private func upload(_ item: PhotosPickerItem) async {
        isWorking = true
        defer { isWorking = false; pickerItem = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return }
            let mime = data.starts(with: [0x89, 0x50, 0x4E, 0x47]) ? "image/png" : "image/jpeg"
            try await branding.uploadLogo(data, mimeType: mime, variant: "login-light")
            ToastCenter.shared.show("Logo actualizat")
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    @MainActor
    private func remove() async {
        isWorking = true
        defer { isWorking = false }
        do {
            // Clear both slots so no stale dark-theme file lingers (web does the same).
            try? await branding.resetLogo(variant: "login-dark")
            try await branding.resetLogo(variant: "login-light")
            ToastCenter.shared.show("Logo șters — se afișează inițiala firmei")
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

/// Route `.brandingSettings` — the Identitate card on its own screen.
struct BrandingSettingsView: View {
    var body: some View {
        ScrollView {
            OrgLogoCard()
                .padding(16)
                .frame(maxWidth: 680)
                .frame(maxWidth: .infinity)
        }
        .background(AppTheme.Colors.appBackground.ignoresSafeArea())
        .navigationTitle("Identitate")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        BrandingSettingsView()
    }
}
