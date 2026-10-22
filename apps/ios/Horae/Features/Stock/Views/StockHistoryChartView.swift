import SwiftUI
import Charts

struct StockHistoryChartView: View {
    let materialId: String
    let materialTitle: String

    @State private var movements: [StockMovementResponse] = []
    @State private var isLoading = false
    @State private var error: APIError?

    var body: some View {
        Group {
            if isLoading && movements.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if movements.isEmpty {
                ContentUnavailableView(
                    "Nicio mișcare",
                    systemImage: "chart.line.downtrend.xyaxis",
                    description: Text("Nu există mișcări de stoc pentru acest material")
                )
            } else {
                chartContent
            }
        }
        .navigationTitle("Istoric stoc")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadMovements() }
        .errorAlert($error)
    }

    private var chartContent: some View {
        ScrollView {
            VStack(spacing: AppTheme.Spacing.lg) {
                // Chart
                Chart(movements) { movement in
                    PointMark(
                        x: .value("Data", movement.createdAt),
                        y: .value("Cantitate", movement.quantity)
                    )
                    .foregroundStyle(pointColor(for: movement.movementType))

                    LineMark(
                        x: .value("Data", movement.createdAt),
                        y: .value("Cantitate", movement.quantity)
                    )
                    .foregroundStyle(.secondary)
                    .interpolationMethod(.catmullRom)
                }
                .chartXAxis {
                    AxisMarks(values: .automatic) { _ in
                        AxisGridLine()
                        AxisValueLabel(format: .dateTime.day().month(.abbreviated))
                    }
                }
                .frame(height: 220)
                .padding()

                // Movement list
                LazyVStack(spacing: 0) {
                    ForEach(movements) { movement in
                        HStack {
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                                Text(movement.movementType.displayName)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(quantityColor(for: movement.movementType))
                                Text(StockDate.shortTime(movement.createdAt))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(quantitySign(for: movement.movementType))\(movement.quantity.qtyFormatted)")
                                .font(.subheadline.weight(.semibold).monospacedDigit())
                                .foregroundStyle(quantityColor(for: movement.movementType))
                        }
                        .padding(.horizontal, AppTheme.Spacing.lg)
                        .padding(.vertical, AppTheme.Spacing.sm)

                        Divider()
                            .padding(.leading, AppTheme.Spacing.lg)
                    }
                }
            }
        }
    }

    /// Direction sign for the amount. AJUSTARE is an absolute value (the stock
    /// is SET to the quantity), so it gets no sign — a "-" would read as a delta.
    private func quantitySign(for type: StockMovementType) -> String {
        switch type {
        case .INTRARE, .INTRARE_PRODUCTIE: "+"
        case .IESIRE_PRODUCTIE, .IESIRE_TESTE, .IESIRE_VANZARE: "-"
        case .AJUSTARE, .REZERVARE, .ELIBERARE: ""
        }
    }

    /// Green in / red out; neutral for AJUSTARE (absolute) and reservation moves.
    private func quantityColor(for type: StockMovementType) -> Color {
        switch type {
        case .INTRARE, .INTRARE_PRODUCTIE: .green
        case .IESIRE_PRODUCTIE, .IESIRE_TESTE, .IESIRE_VANZARE: .red
        case .AJUSTARE, .REZERVARE, .ELIBERARE: .primary
        }
    }

    private func pointColor(for type: StockMovementType) -> Color {
        switch type {
        case .INTRARE, .INTRARE_PRODUCTIE: .green
        case .IESIRE_PRODUCTIE, .IESIRE_TESTE, .IESIRE_VANZARE: .red
        case .AJUSTARE, .REZERVARE, .ELIBERARE: .gray
        }
    }

    private func loadMovements() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let query = StockMovementQuery(rawMaterialId: materialId)
            let result = try await StockService.shared.fetchMovements(query: query)
            movements = result.data
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
    }
}
