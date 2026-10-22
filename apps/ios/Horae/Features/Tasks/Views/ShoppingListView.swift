import SwiftUI
import Observation

/// Shopping list item from the API.
struct ShoppingListItem: Decodable, Identifiable, Sendable {
    var id: String { rawMaterialId }
    let rawMaterialId: String
    let rawMaterialTitle: String
    let unit: String
    let totalNeeded: Double
    let totalAvailable: Double
    let shortage: Double
    let blockedTaskCount: Int
    let blockedTasks: [ShoppingListBlockedTask]
}

struct ShoppingListBlockedTask: Decodable, Sendable {
    let taskId: String
    let taskTitle: String
    let neededQuantity: Double
}

struct ShoppingListResponse: Decodable, Sendable {
    let items: [ShoppingListItem]
}

@Observable
final class ShoppingListViewModel {
    var items: [ShoppingListItem] = []
    var isLoading = false
    var error: APIError?

    private let service = TaskService.shared

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            items = try await service.fetchShoppingList()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    var shareText: String {
        var lines: [String] = ["Lista de cumparaturi:", ""]
        for item in items {
            lines.append("- \(item.rawMaterialTitle): lipsesc \(UnitType.formatQty(item.shortage, unitRaw: item.unit)) (necesar: \(UnitType.formatQty(item.totalNeeded, unitRaw: item.unit)), disponibil: \(UnitType.formatQty(item.totalAvailable, unitRaw: item.unit)))")
        }
        return lines.joined(separator: "\n")
    }
}

struct ShoppingListView: View {
    @State private var viewModel = ShoppingListViewModel()
    @State private var showShareSheet = false

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.items.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.items.isEmpty {
                ContentUnavailableView(
                    "Lista goala",
                    systemImage: "cart",
                    description: Text("Niciun task blocat din cauza stocului")
                )
            } else {
                List(viewModel.items) { item in
                    ShoppingListRow(item: item)
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Lista de cumparaturi")
        .toolbar {
            if !viewModel.items.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: viewModel.shareText) {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await Task { await viewModel.load() }.value }
    }
}

// MARK: - Shopping List Row

private struct ShoppingListRow: View {
    let item: ShoppingListItem

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            HStack {
                Circle()
                    .fill(item.totalAvailable <= 0 ? .red : .orange)
                    .frame(width: 8, height: 8)

                Text(item.rawMaterialTitle)
                    .font(.subheadline.weight(.semibold))

                Spacer()

                Text(UnitType.formatQty(item.shortage, unitRaw: item.unit))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.red)
            }

            HStack(spacing: AppTheme.Spacing.lg) {
                VStack(alignment: .leading) {
                    Text("Disponibil")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(UnitType.formatQty(item.totalAvailable, unitRaw: item.unit))
                        .font(.caption.weight(.medium))
                }

                VStack(alignment: .leading) {
                    Text("Necesar")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(UnitType.formatQty(item.totalNeeded, unitRaw: item.unit))
                        .font(.caption.weight(.medium))
                }

                Spacer()

                Text("\(item.blockedTaskCount) task\(item.blockedTaskCount == 1 ? "" : "-uri") blocat\(item.blockedTaskCount == 1 ? "" : "e")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, AppTheme.Spacing.xs)
    }
}

#Preview {
    NavigationStack {
        ShoppingListView()
    }
}
