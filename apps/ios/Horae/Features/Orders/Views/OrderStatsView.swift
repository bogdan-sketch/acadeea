import SwiftUI
import Charts

struct OrderStatsView: View {
    @State private var stats: OrderStatsResponse?
    @State private var isLoading = true
    @State private var error: String?
    @State private var dateRange: DateRange = .thisMonth

    private let service = OrderService.shared

    enum DateRange: String, CaseIterable {
        case thisWeek = "Săptămâna"
        case thisMonth = "Luna"
        case last3Months = "3 luni"
        case allTime = "Tot"

        var dateFrom: Date? {
            let cal = RoDate.calendar
            switch self {
            case .thisWeek: return cal.date(byAdding: .day, value: -7, to: Date())
            case .thisMonth: return cal.date(byAdding: .month, value: -1, to: Date())
            case .last3Months: return cal.date(byAdding: .month, value: -3, to: Date())
            case .allTime: return nil
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: AppTheme.Spacing.lg) {
                // Date range picker
                Picker("Perioada", selection: $dateRange) {
                    ForEach(DateRange.allCases, id: \.self) { range in
                        Text(range.rawValue).tag(range)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, AppTheme.Spacing.lg)

                if isLoading {
                    ProgressView()
                        .padding(.top, 40)
                } else if let stats {
                    // Summary cards
                    HStack(spacing: AppTheme.Spacing.md) {
                        OrderStatCard(title: "Total", value: "\(stats.totalOrders)", color: AppTheme.Colors.secondaryAccent)
                        OrderStatCard(title: "Livrate", value: "\(stats.completedOrders)", color: AppTheme.Status.fg(.ready))
                    }
                    .padding(.horizontal, AppTheme.Spacing.lg)

                    // Status chart
                    if !stats.statusCounts.isEmpty {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Text("Per status")
                                .font(.headline)
                                .padding(.horizontal, AppTheme.Spacing.lg)

                            Chart {
                                ForEach(stats.statusCounts.sorted(by: { $0.key < $1.key }), id: \.key) { status, count in
                                    BarMark(
                                        x: .value("Status", displayName(for: status)),
                                        y: .value("Comenzi", count)
                                    )
                                    .foregroundStyle(statusColor(status))
                                }
                            }
                            .frame(height: 200)
                            .padding(.horizontal, AppTheme.Spacing.lg)
                        }
                    }

                    // Delivery points chart
                    if !stats.deliveryPointCounts.isEmpty {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Text("Per punct de livrare")
                                .font(.headline)
                                .padding(.horizontal, AppTheme.Spacing.lg)

                            Chart(stats.deliveryPointCounts) { dp in
                                BarMark(
                                    x: .value("Comenzi", dp.count),
                                    y: .value("Punct", dp.deliveryPoint)
                                )
                                .foregroundStyle(AppTheme.Colors.secondaryAccent.gradient)
                            }
                            .frame(height: CGFloat(stats.deliveryPointCounts.count * 40 + 20))
                            .padding(.horizontal, AppTheme.Spacing.lg)
                        }
                    }
                } else if let error {
                    ContentUnavailableView(
                        "Eroare",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                }
            }
            .padding(.vertical, AppTheme.Spacing.lg)
        }
        .navigationTitle("Statistici comenzi")
        .onChange(of: dateRange) { loadStats() }
        .task { loadStats() }
    }

    private func loadStats() {
        Task {
            isLoading = true
            error = nil
            do {
                stats = try await service.fetchStats(dateFrom: dateRange.dateFrom)
            } catch {
                self.error = error.localizedDescription
            }
            isLoading = false
        }
    }

    private func displayName(for status: String) -> String {
        OrderStatus(rawValue: status)?.displayName ?? status
    }

    private func statusColor(_ status: String) -> Color {
        OrderStatus(rawValue: status).map { AppTheme.Status.fg($0.kind) } ?? AppTheme.Colors.secondaryLabel
    }
}

// MARK: - Stat Card

private struct OrderStatCard: View {
    let title: String
    let value: String
    let color: Color

    var body: some View {
        VStack(spacing: AppTheme.Spacing.xs) {
            Text(value)
                .font(.title.bold())
                .foregroundStyle(color)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(AppTheme.Spacing.lg)
        .background(AppTheme.Colors.card)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    NavigationStack { OrderStatsView() }
}
