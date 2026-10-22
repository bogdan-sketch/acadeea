import SwiftUI

struct RecipeStockRow: View {
    let item: RecipeStockResponse
    var showCategoryWarning: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                if showCategoryWarning {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
                Text(item.name)
                    .font(.body.bold())
                Spacer()
                Text("\(item.unit.formatQty(item.stockCount))")
                    .font(.subheadline)
                    .foregroundColor(item.stockCount > 0 ? .primary : .red)
            }

            HStack(spacing: AppTheme.Spacing.sm) {
                if showCategoryWarning {
                    Text(item.category ?? "Fără categorie")
                        .font(.caption)
                        .padding(.horizontal, AppTheme.Spacing.sm)
                        .padding(.vertical, 2)
                        .background(Color.orange.opacity(0.15))
                        .foregroundStyle(.orange)
                        .clipShape(Capsule())
                } else if let category = item.category {
                    Text(category)
                        .font(.caption)
                        .padding(.horizontal, AppTheme.Spacing.sm)
                        .padding(.vertical, 2)
                        .background(Color.accentColor.opacity(0.12))
                        .clipShape(Capsule())
                }

                if !item.flavors.isEmpty {
                    ForEach(item.flavors.prefix(3), id: \.self) { flavor in
                        Text(flavor)
                            .font(.caption2)
                            .padding(.horizontal, AppTheme.Spacing.xs)
                            .padding(.vertical, 2)
                            .background(Color(.tertiarySystemFill))
                            .clipShape(Capsule())
                    }
                }

                if item.reservedCount > 0 {
                    Spacer()
                    Text("Rezervat: \(item.reservedCount)")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        }
        .padding(.vertical, AppTheme.Spacing.xxs)
    }
}
