import PhotosUI
import SwiftUI

/// 56 pt circular avatar for the Settings profile row, with a camera badge
/// (PhotosPicker) and "Șterge poza" when an avatar is set.
struct ProfileAvatarEditor: View {
    let user: AuthUser

    @State private var viewModel = ProfileAvatarViewModel()
    @State private var pickerItem: PhotosPickerItem?
    @State private var showPicker = false
    @State private var showDeleteConfirm = false

    private let size: CGFloat = 56

    var body: some View {
        UserAvatarView(
            avatarUrl: user.avatarUrl,
            firstName: user.firstName,
            lastName: user.lastName,
            size: size
        )
        .overlay {
            if viewModel.isWorking {
                Circle().fill(.ultraThinMaterial)
                ProgressView()
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if !viewModel.isWorking {
                editButton
                    .offset(x: 12, y: 12)
            }
        }
        .padding(.trailing, AppTheme.Spacing.xs)
        .photosPicker(isPresented: $showPicker, selection: $pickerItem, matching: .images)
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
        .confirmationDialog("Ștergi poza de profil?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Șterge poza", role: .destructive) {
                Task { await viewModel.delete() }
            }
            Button("Anulează", role: .cancel) {}
        }
        .errorAlert($viewModel.error)
    }

    @ViewBuilder
    private var editButton: some View {
        if user.avatarUrl == nil {
            Button {
                showPicker = true
            } label: {
                cameraBadge
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Adaugă poză de profil")
            .help("Adaugă poza de profil — se comprimă automat")
        } else {
            Menu {
                Button {
                    showPicker = true
                } label: {
                    Label("Schimbă poza", systemImage: "photo.on.rectangle")
                }
                Button(role: .destructive) {
                    showDeleteConfirm = true
                } label: {
                    Label("Șterge poza", systemImage: "trash")
                }
            } label: {
                cameraBadge
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Schimbă poza de profil")
            .help("Schimbă sau șterge poza de profil")
        }
    }

    /// 24 pt accent badge (card-coloured ring) inside a 44 pt hit area.
    private var cameraBadge: some View {
        Image(systemName: "camera.fill")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(AppTheme.Colors.onPrimary)
            .frame(width: 24, height: 24)
            .background(AppTheme.Colors.primary, in: Circle())
            .overlay(Circle().strokeBorder(AppTheme.Colors.card, lineWidth: 2))
            .frame(width: 44, height: 44)
            .contentShape(Circle())
    }
}
