import SwiftUI

/// Product picker for a sales line: name-match suggestions first, then every
/// sellable product, each with its stock at the deduction's location.
/// Mirrors web `ProductCombobox`.
struct SalesProductPickerView: View {
    let products: [SalesProductOption]
    let candidates: [SalesMatchCandidate]
    let selectedId: String?
    let onSelect: (SalesProductOption) -> Void

    @State private var searchText = ""
    @Environment(\.dismiss) private var dismiss

    private var suggested: [SalesProductOption] {
        let byId = Dictionary(products.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return candidates.compactMap { byId[$0.id] }
    }

    private func matches(_ p: SalesProductOption) -> Bool {
        searchText.isEmpty || p.name.localizedStandardContains(searchText)
    }

    var body: some View {
        NavigationStack {
            List {
                let suggestedIds = Set(suggested.map(\.id))
                let shownSuggestions = suggested.filter(matches)
                let others = products.filter { !suggestedIds.contains($0.id) && matches($0) }
                if !shownSuggestions.isEmpty {
                    Section("Sugestii după nume") {
                        ForEach(shownSuggestions) { row($0) }
                    }
                }
                Section("Toate produsele") {
                    ForEach(others) { row($0) }
                }
            }
            .listStyle(.insetGrouped)
            .overlay {
                if products.isEmpty {
                    ProgressView()
                } else if !searchText.isEmpty && !products.contains(where: matches) {
                    ContentUnavailableView.search(text: searchText)
                }
            }
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Caută produs...")
            .navigationTitle("Alege produsul")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Renunță") { dismiss() }
                }
            }
        }
    }

    private func row(_ p: SalesProductOption) -> some View {
        Button { onSelect(p) } label: {
            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: "checkmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .opacity(p.id == selectedId ? 1 : 0)
                    .accessibilityHidden(true)
                Text(p.name)
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("\(p.stock.qtyFormatted) \(p.unit.abbreviation)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(p.name), stoc \(p.stock.qtyFormatted) \(p.unit.abbreviation)")
        .accessibilityAddTraits(p.id == selectedId ? [.isSelected] : [])
    }
}

#Preview {
    SalesProductPickerView(products: [], candidates: [], selectedId: nil) { _ in }
}
