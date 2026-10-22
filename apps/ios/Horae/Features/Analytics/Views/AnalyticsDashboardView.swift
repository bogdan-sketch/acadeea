import SwiftUI

@Observable
final class AnalyticsDashboardViewModel {
    var summary: AnalyticsSummary?
    var production: ProductionAnalytics?
    var orders: OrderAnalytics?
    var users: [UserProductivity] = []
    var isLoading = true
    var error: APIError?

    private let service = AnalyticsService.shared

    func load() async {
        isLoading = true
        error = nil
        do {
            async let s = service.fetchSummary()
            async let p = service.fetchProductionAnalytics()
            async let o = service.fetchOrderAnalytics()
            async let u = service.fetchUserProductivity()
            summary = try await s
            production = try await p
            orders = try await o
            users = try await u
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isLoading = false
    }
}

struct AnalyticsDashboardView: View {
    @State private var viewModel = AnalyticsDashboardViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 16) {
                        if let summary = viewModel.summary {
                            summaryCards(summary)
                        }
                        if let production = viewModel.production {
                            productionCard(production)
                        }
                        if let orders = viewModel.orders {
                            ordersCard(orders)
                        }
                        if !viewModel.users.isEmpty {
                            usersCard(viewModel.users)
                        }
                    }
                    .padding()
                }
                .refreshable { await Task { await viewModel.load() }.value }
            }
        }
        .navigationTitle("Analitice")
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
    }

    private func summaryCards(_ s: AnalyticsSummary) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatCard(title: "Taskuri azi", value: "\(s.tasksCompletedToday)", icon: "checkmark.circle", color: AppTheme.Status.fg(.ready))
            StatCard(title: "Comenzi azi", value: "\(s.ordersToday)", icon: "cart", color: AppTheme.Colors.secondaryAccent)
            StatCard(title: "Stoc scăzut", value: "\(s.lowStockItems)", icon: "exclamationmark.triangle", color: AppTheme.Status.fg(.warning))
            StatCard(title: "Utilizatori activi", value: "\(s.activeUsers)", icon: "person.2", color: AppTheme.Colors.tertiaryAccent)
        }
    }

    private func productionCard(_ p: ProductionAnalytics) -> some View {
        GroupBox("Producție") {
            VStack(alignment: .leading, spacing: 8) {
                LabeledContent("Finalizate", value: "\(p.totalTasksCompleted)")
                LabeledContent("Anulate", value: "\(p.totalTasksCancelled)")
                if let avg = p.averageCompletionHours {
                    LabeledContent("Timp mediu", value: "\(RoFormat.number(avg, fractionDigits: 1)) ore")
                }
                if let variance = p.yieldVarianceAvg {
                    LabeledContent("Varianță randament", value: RoFormat.percent(variance))
                }
            }
        }
    }

    private func ordersCard(_ o: OrderAnalytics) -> some View {
        GroupBox("Comenzi") {
            VStack(alignment: .leading, spacing: 8) {
                LabeledContent("Total", value: "\(o.totalOrders)")
                if let rate = o.onTimeRate {
                    LabeledContent("La timp", value: RoFormat.percent(rate, fractionDigits: 0))
                }
                if !o.popularProducts.isEmpty {
                    Text("Produse populare").font(.caption).foregroundStyle(.secondary)
                    ForEach(o.popularProducts.prefix(5)) { p in
                        LabeledContent(p.name, value: p.quantity.qtyFormatted)
                    }
                }
            }
        }
    }

    private func usersCard(_ users: [UserProductivity]) -> some View {
        GroupBox("Productivitate echipă") {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(users.prefix(10)) { user in
                    HStack {
                        Text(user.fullName).font(.subheadline)
                        Spacer()
                        Text("\(user.tasksCompleted) task-uri")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let avg = user.avgCompletionHours {
                            Text("\(RoFormat.number(avg, fractionDigits: 1)) h")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)
            Text(value)
                .font(.title)
                .fontWeight(.bold)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
