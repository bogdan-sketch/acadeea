import SwiftUI

/// Setări › Temă — 3×2 grid of scheme tiles (board: Setari.dc.html). Each
/// tile previews the scheme on its own paper: a primary swatch bar + a card
/// square, the name and "Luminos"/"Întunecat". Tap applies it live. Tiles
/// only — no Picker/menu (owner's rule).
struct SchemePickerGrid: View {
    // Read from the shared store (also published in the environment at the
    // root) so the tiles work in any presentation context.
    private var store: AppSchemeStore { .shared }

    private let columns = Array(
        repeating: GridItem(.flexible(), spacing: AppTheme.Spacing.sm), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: AppTheme.Spacing.sm) {
            ForEach(AppScheme.allCases) { scheme in
                SchemeTile(scheme: scheme, isSelected: scheme == store.scheme) {
                    withAnimation(.snappy) { store.scheme = scheme }
                }
            }
        }
        .sensoryFeedback(.selection, trigger: store.scheme)
    }
}

/// Section header row: "TEMĂ" on the left, "Atelier · luminos" on the right.
struct SchemePickerHeader: View {
    // Read from the shared store (also published in the environment at the
    // root) so the tiles work in any presentation context.
    private var store: AppSchemeStore { .shared }

    var body: some View {
        HSectionHeader("Temă") {
            Text("\(store.scheme.name) · \(store.scheme.kindLabel.lowercased())")
                .font(AppFont.body(11))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .textCase(nil)
        }
    }
}

// MARK: - Tile

private struct SchemeTile: View {
    let scheme: AppScheme
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: AppTheme.Spacing.xs) {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(scheme.primary)
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(scheme.card)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .strokeBorder(scheme.border, lineWidth: 1))
                        .aspectRatio(1, contentMode: .fit)
                }
                .frame(height: 18)
                .accessibilityHidden(true)

                Text(scheme.name)
                    .font(AppFont.body(12, weight: .bold))
                    .lineLimit(1)
                Text(scheme.kindLabel)
                    .font(AppFont.body(10))
                    .opacity(0.7)
                    .lineLimit(1)
            }
            .foregroundStyle(scheme.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(scheme.background, in: tileShape)
            .overlay(
                tileShape.strokeBorder(
                    isSelected ? AppTheme.Colors.primary : AppTheme.Colors.border,
                    lineWidth: 2))
            .contentShape(tileShape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Temă \(scheme.name) (\(scheme.kindLabel.lowercased()))")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .help("Temă \(scheme.name) (\(scheme.kindLabel.lowercased()))")
    }

    private var tileShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
    }
}

#Preview("Temă") {
    VStack(alignment: .leading, spacing: 8) {
        SchemePickerHeader()
        SchemePickerGrid()
    }
    .padding()
    .background(AppTheme.Colors.appBackground)
    .environment(AppSchemeStore.shared)
}
