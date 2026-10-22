import SwiftUI

struct StockMovementListView: View {
    @State private var viewModel = StockMovementListViewModel()

    var body: some View {
        PaginatedListView(
            items: viewModel.movements,
            isLoading: viewModel.isLoading,
            hasNextPage: viewModel.hasNextPage,
            emptyTitle: "Nu există mișcări de stoc",
            emptySystemImage: "arrow.left.arrow.right",
            onLoadMore: { await viewModel.loadMore() },
            onRefresh: { await viewModel.refresh() }
        ) { movement in
            StockMovementRowView(movement: movement)
        }
        .task { await viewModel.loadMovements(reset: true) }
        .errorAlert($viewModel.error)
        .toolbar {
            // Excel of the log (last 30 days): download, then the same spot shares it.
            ToolbarItem(placement: .primaryAction) {
                if let url = viewModel.exportURL {
                    ShareLink(item: url) {
                        Label("Trimite Excel", systemImage: "square.and.arrow.up")
                    }
                } else {
                    Button {
                        Task { await viewModel.exportXlsx() }
                    } label: {
                        if viewModel.isExporting {
                            ProgressView()
                        } else {
                            Label("Exportă Excel", systemImage: "square.and.arrow.down")
                        }
                    }
                    .disabled(viewModel.isExporting)
                }
            }
        }
    }
}

struct StockMovementRowView: View {
    let movement: StockMovementResponse

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                Image(systemName: movementIcon)
                    .foregroundStyle(movementColor)
                Text(movement.itemTitle ?? movement.movementType.displayName)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                Text(movement.unit.formatQty(movement.quantity))
                    .font(.subheadline.bold())
                    .foregroundStyle(movementColor)
            }

            HStack(spacing: AppTheme.Spacing.sm) {
                // Movement type as a small label when we already show the item name.
                if movement.itemTitle != nil {
                    Text(movement.movementType.displayName)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(movementColor)
                    Text("·")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(StockDate.shortTime(movement.createdAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let location = movement.locationName, !location.isEmpty {
                    Text("·")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(location)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                if let author = movement.createdByName, !author.isEmpty {
                    Text("·")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(author)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            if let note = movement.referenceNote, !note.isEmpty {
                Text(StockText.localizedNote(note))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, AppTheme.Spacing.xxs)
    }

    private var movementIcon: String {
        switch movement.movementType {
        case .INTRARE: "arrow.down.circle.fill"
        case .IESIRE_PRODUCTIE: "arrow.up.circle.fill"
        case .AJUSTARE: "pencil.circle.fill"
        case .REZERVARE: "lock.circle.fill"
        case .ELIBERARE: "lock.open.fill"
        case .INTRARE_PRODUCTIE: "arrow.down.forward.circle.fill"
        case .IESIRE_TESTE: "flask.fill"
        case .IESIRE_VANZARE: "cart.fill"
        }
    }

    private var movementColor: Color {
        switch movement.movementType {
        case .INTRARE: .green
        case .IESIRE_PRODUCTIE: .red
        case .AJUSTARE: .orange
        case .REZERVARE: .blue
        case .ELIBERARE: .purple
        case .INTRARE_PRODUCTIE: .teal
        case .IESIRE_TESTE: .pink
        case .IESIRE_VANZARE: .red
        }
    }
}
