import PhotosUI
import SwiftUI

/// Hero of the recipe detail (188 pt, under the transparent bar): the
/// uploaded photo or a tinted tile with the initial, the category / type pills
/// bottom-left and, for editors, an accent camera button bottom-right
/// (PhotosPicker; with a photo, a menu with "Schimbă poza" / "Șterge poza").
struct RecipePhotoHeader: View {
    let recipe: RecipeResponse
    let canEdit: Bool
    let isUploading: Bool
    let onPicked: (Data) async -> Void
    let onDelete: () async -> Void
    /// Hero height including the area under the status/nav bar.
    var height: CGFloat = 188
    /// Category colour for the placeholder tile (nil = scheme primary).
    var tint: Color?

    @State private var pickerItem: PhotosPickerItem?
    @State private var showPicker = false
    @State private var showDeleteConfirm = false
    @State private var uploadTrigger = 0

    var body: some View {
        ZStack {
            Rectangle().fill((tint ?? AppTheme.Colors.primary).opacity(0.2))
            Text(recipe.name.trimmingCharacters(in: .whitespaces).prefix(1).uppercased())
                .font(AppFont.title(96))
                .foregroundStyle(AppTheme.Colors.label.opacity(0.35))
                .padding(.top, 30)
                .accessibilityHidden(true)
            if recipe.photoUrl != nil {
                RecipePhotoView(photoUrl: recipe.photoUrl, name: recipe.name, cornerRadius: 0)
            }
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .clipped()
        .overlay {
            if isUploading {
                Rectangle().fill(.ultraThinMaterial)
                ProgressView("Se încarcă…")
            }
        }
        .overlay(alignment: .bottomLeading) {
            HStack(spacing: 6) {
                if let category = recipe.category, !category.isEmpty { pill(category) }
                pill(recipe.type == .FINAL ? "Produs final" : "Semipreparat")
                if recipe.isDraft { pill("Schiță") }
                if recipe.isArchived { pill("Arhivată") }
            }
            .padding(.leading, 16)
            .padding(.bottom, 14)
        }
        .overlay(alignment: .bottomTrailing) {
            if canEdit && !isUploading {
                editButton
                    .padding(.trailing, 12)
                    .padding(.bottom, 8)
            }
        }
        .photosPicker(isPresented: $showPicker, selection: $pickerItem, matching: .images)
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                defer { pickerItem = nil }
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await onPicked(data)
                    uploadTrigger += 1
                }
            }
        }
        .sensoryFeedback(.success, trigger: uploadTrigger)
        .confirmationDialog("Ștergi poza rețetei?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Șterge poza", role: .destructive) {
                Task { await onDelete() }
            }
            Button("Anulează", role: .cancel) {}
        }
    }

    private func pill(_ text: String) -> some View {
        Text(text)
            .font(AppFont.body(11, weight: .bold))
            .lineLimit(1)
            .foregroundStyle(AppTheme.Colors.label)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(AppTheme.Colors.card.opacity(0.92), in: Capsule())
    }

    @ViewBuilder
    private var editButton: some View {
        if recipe.photoUrl == nil {
            Button {
                showPicker = true
            } label: {
                cameraIcon
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Adaugă poza rețetei")
            .help("Adaugă poza — se comprimă automat")
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
                cameraIcon
            }
            .accessibilityLabel("Schimbă poza rețetei")
            .help("Schimbă sau șterge poza rețetei")
        }
    }

    private var cameraIcon: some View {
        Image(systemName: "camera")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(AppTheme.Colors.onPrimary)
            .frame(width: 40, height: 40)
            .background(AppTheme.Colors.primary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .shadow(color: AppTheme.Colors.primary.opacity(0.35), radius: 6, y: 3)
            .padding(2)
            .contentShape(Rectangle())
    }
}

// MARK: - Tags without a photo

/// Category / type / draft / archived tags of a recipe, shown above the name
/// when the organisation has recipe photos turned off.
struct RecipeTagRow: View {
    let recipe: RecipeResponse

    var body: some View {
        HStack(spacing: 6) {
            if let category = recipe.category, !category.isEmpty { tag(category) }
            tag(recipe.type == .FINAL ? "Produs final" : "Semipreparat")
            if recipe.isDraft { tag("Schiță") }
            if recipe.isArchived { tag("Arhivată") }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
        .accessibilityElement(children: .combine)
    }

    private func tag(_ text: String) -> some View {
        Text(text)
            .font(AppFont.body(11, weight: .bold))
            .lineLimit(1)
            .foregroundStyle(AppTheme.Colors.label)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(AppTheme.Colors.card, in: Capsule())
            .overlay(Capsule().strokeBorder(AppTheme.Colors.border, lineWidth: 1))
    }
}
