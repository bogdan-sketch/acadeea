import SwiftUI

/// Drag & drop the ONE global category order that drives the stock carousel + filters
/// on every client.
///
/// A single flat, permanently-editing `List` of every category across all
/// super-categories. Each row keeps its super-category colour (dot) and shows the super
/// name as a secondary label so users know where it belongs. A category can be dragged
/// ANYWHERE globally — e.g. a Semipreparat category above every Materie prima one. On
/// drop the whole flat list PATCHes `categories/reorder-global`; optimistic with
/// rollback + a toast on failure. Categories arrive already sorted by the global
/// ordinal and are NEVER re-sorted client-side.
struct CategoryReorderView: View {
    /// Called on dismiss when at least one reorder was persisted, so the presenter
    /// can refresh its own lists.
    let onDismiss: (Bool) -> Void

    @State private var viewModel = CategoryReorderViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Se încarcă...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let loadError = viewModel.loadError {
                    ContentUnavailableView {
                        Label("Eroare", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(loadError)
                    } actions: {
                        Button("Reincarca") { Task { await viewModel.load() } }
                    }
                } else if viewModel.categories.isEmpty {
                    ContentUnavailableView(
                        "Nicio categorie",
                        systemImage: "square.stack.3d.up",
                        description: Text("Adaugă categorii mai întâi pentru a le reordona.")
                    )
                } else {
                    list
                }
            }
            .navigationTitle("Reordonează")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Gata") {
                        onDismiss(viewModel.didReorder)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .safeAreaInset(edge: .bottom) { toastBanner }
        }
        .task { await viewModel.load() }
        .sensoryFeedback(.warning, trigger: viewModel.failureTrigger)
    }

    // MARK: - Flat global list

    private var list: some View {
        List {
            Section {
                ForEach(viewModel.categories) { cat in
                    CategoryReorderRow(
                        name: cat.name,
                        superName: viewModel.superName(for: cat.kind),
                        color: cat.color
                    )
                }
                .onMove { source, dest in
                    viewModel.move(from: source, to: dest)
                }
            } footer: {
                Text("Trage o categorie oriunde în listă. Această ordine se aplică în carusel și filtre pe toate dispozitivele.")
            }
        }
        .listStyle(.insetGrouped)
        .environment(\.editMode, .constant(.active))
    }

    // MARK: - Toast

    @ViewBuilder
    private var toastBanner: some View {
        if let toast = viewModel.toast {
            Label(toast, systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.red, in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.bottom, AppTheme.Spacing.sm)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .task {
                    try? await Task.sleep(for: .seconds(2.5))
                    withAnimation(.spring(.snappy)) { viewModel.toast = nil }
                }
                .accessibilityAddTraits(.isStaticText)
        }
    }
}

// MARK: - Row

private struct CategoryReorderRow: View {
    let name: String
    let superName: String
    let color: String?

    var body: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            Circle()
                .fill(AppTheme.Colors.category(hex: color))
                .frame(width: 12, height: 12)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(name)
                    .font(.body)
                Text(superName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), în \(superName)")
        .accessibilityHint("Trage pentru a reordona")
    }
}

#Preview {
    CategoryReorderView(onDismiss: { _ in })
}
