import SwiftUI

/// Generic infinite-scroll list with pull-to-refresh, pagination, search, and empty state.
///
/// Compact width (iPhone): a plain `List`. Regular width (iPad): the same rows
/// laid out as a grid of cards (`adaptiveGrid`, on by default) so a 1000pt-wide
/// screen is not one row per line with a sea of whitespace.
struct PaginatedListView<Item: Identifiable & Sendable, Content: View>: View {
    let items: [Item]
    let isLoading: Bool
    let hasNextPage: Bool
    let searchText: Binding<String>?
    let emptyTitle: String
    let emptySystemImage: String
    let adaptiveGrid: Bool
    let onLoadMore: () async -> Void
    let onRefresh: () async -> Void
    @ViewBuilder let rowContent: (Item) -> Content

    @Environment(\.horizontalSizeClass) private var sizeClass

    /// How many rows before the end of the list the next page starts loading.
    private static var prefetchThreshold: Int { 5 }

    init(
        items: [Item],
        isLoading: Bool,
        hasNextPage: Bool,
        searchText: Binding<String>? = nil,
        emptyTitle: String = "Nu exista date",
        emptySystemImage: String = "tray",
        adaptiveGrid: Bool = true,
        onLoadMore: @escaping () async -> Void,
        onRefresh: @escaping () async -> Void,
        @ViewBuilder rowContent: @escaping (Item) -> Content
    ) {
        self.items = items
        self.isLoading = isLoading
        self.hasNextPage = hasNextPage
        self.searchText = searchText
        self.emptyTitle = emptyTitle
        self.emptySystemImage = emptySystemImage
        self.adaptiveGrid = adaptiveGrid
        self.onLoadMore = onLoadMore
        self.onRefresh = onRefresh
        self.rowContent = rowContent
    }

    private var usesGrid: Bool { adaptiveGrid && sizeClass == .regular }

    var body: some View {
        Group {
            if items.isEmpty && !isLoading {
                EmptyStateView(
                    title: emptyTitle,
                    systemImage: emptySystemImage
                )
            } else if usesGrid {
                gridBody
            } else {
                listBody
            }
        }
        .overlay {
            if isLoading && items.isEmpty {
                // Stable identity — a per-render UUID() recreates the spinner on
                // every body pass and can leave it stalled half-drawn.
                ProgressView()
                    .id("paginated-initial-spinner")
            }
        }
    }

    // MARK: - Compact: List

    private var listBody: some View {
        List {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                rowContent(item)
                    // Fara liniile gri dintre randuri — barele colorate +
                    // spatierea separa suficient elementele.
                    .listRowSeparator(.hidden)
                    .onAppear { prefetchIfNeeded(index) }
            }

            if isLoading {
                HStack {
                    Spacer()
                    // Identity changes per page (not per render): a reused
                    // UIActivityIndicator inside a List row comes back frozen
                    // mid-frame, while a per-render UUID() recreates the row on
                    // every body pass and can leave a stalled, half-drawn spinner.
                    ProgressView()
                        .id("paginated-spinner-\(items.count)")
                    Spacer()
                }
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .refreshable { await Task { await onRefresh() }.value }
    }

    // MARK: - Regular: grid of cards

    private var gridBody: some View {
        GeometryReader { geo in
            let columns = AdaptiveLayout.gridColumns(
                for: geo.size.width - 2 * AdaptiveLayout.gutter)
            ScrollView {
                LazyVGrid(
                    columns: Array(
                        repeating: GridItem(.flexible(), spacing: AppTheme.Spacing.md),
                        count: columns),
                    spacing: AppTheme.Spacing.md
                ) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        rowContent(item)
                            .adaptiveCard()
                            // Rows are NavigationLinks: outside a List they'd
                            // tint their label — keep the text primary.
                            .buttonStyle(.plain)
                            .onAppear { prefetchIfNeeded(index) }
                    }

                    if isLoading {
                        ProgressView()
                            .id("paginated-spinner-\(items.count)")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, AppTheme.Spacing.md)
                            .gridCellColumns(columns)
                    }
                }
                .padding(.horizontal, AdaptiveLayout.gutter)
                .padding(.vertical, AppTheme.Spacing.md)
            }
            .refreshable { await Task { await onRefresh() }.value }
        }
    }

    /// Prefetch the next page a few rows before the end so scrolling doesn't
    /// stall at the bottom of the list.
    private func prefetchIfNeeded(_ index: Int) {
        if index >= items.count - Self.prefetchThreshold {
            Task { await onLoadMore() }
        }
    }
}

extension Array where Element: Identifiable {
    /// True when `item` sits within `threshold` rows of the end of the list —
    /// the signal to prefetch the next page before the user hits the bottom.
    func isNearEnd(_ item: Element, threshold: Int = 5) -> Bool {
        guard let index = lastIndex(where: { $0.id == item.id }) else { return false }
        return index >= count - threshold
    }
}
