import SwiftUI
import Observation

@Observable
final class ExpiryTrackingViewModel {
    var items: [ExpiringItem] = []
    var isLoading = true
    var error: APIError?
    var days: Int = 30

    private let service = StockService.shared

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            items = try await service.fetchExpiring(days: days)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

struct ExpiryTrackingView: View {
    @State private var viewModel = ExpiryTrackingViewModel()
    /// Collapsing title — hidden while the list scrolls down.
    @State private var headVisible = true

    /// Horizon chips (owner's rule: chips, never a dropdown).
    private static let horizons: [(days: Int, title: String)] = [
        (7, "7 zile"), (14, "14 zile"), (30, "30 de zile"), (90, "90 de zile"), (180, "180 de zile"), (365, "1 an"),
    ]

    var body: some View {
        // Collapsing title over the pinned horizon chips; only the list
        // scrolls and pulls to refresh.
        VStack(alignment: .leading, spacing: 0) {
            HScreenTitle("Expirări", eyebrow: "Ce expiră în următoarele \(horizonTitle)")
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 12)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
                .autoCollapsible(headVisible)

            horizonChips
                .padding(.horizontal, 16)
                .padding(.top, headVisible ? 0 : 8)
                .padding(.bottom, 12)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)

            ScrollView {
                content
                    .padding(.horizontal, 16)
                    .padding(.top, 2)
                    .padding(.bottom, 24)
                    .frame(maxWidth: 720)
                    .frame(maxWidth: .infinity)
            }
            .refreshable { await Task { await viewModel.load() }.value }
            .autoHideOnScroll($headVisible)
        }
        .appScreenBackground(showsGradient: false)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
    }

    private var horizonTitle: String {
        Self.horizons.first { $0.days == viewModel.days }?.title ?? "\(viewModel.days) zile"
    }

    private var horizonChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Self.horizons, id: \.days) { horizon in
                    HChip(horizon.title, isSelected: viewModel.days == horizon.days) {
                        guard viewModel.days != horizon.days else { return }
                        viewModel.days = horizon.days
                        Task { await viewModel.load() }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
        }
        .padding(.horizontal, -16)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.items.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: 200)
        } else if viewModel.items.isEmpty {
            ContentUnavailableView(
                "Nimic nu expiră curând",
                systemImage: "checkmark.seal",
                description: Text("Niciun lot nu expiră în următoarele \(horizonTitle). Alege un interval mai lung ca să vezi mai departe.")
            )
        } else {
            HCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(viewModel.items.enumerated()), id: \.element.id) { index, item in
                        if index > 0 { StockDivider().padding(.leading, 14) }
                        ExpiryRow(item: item)
                    }
                }
            }
        }
    }
}

// MARK: - Row

private struct ExpiryRow: View {
    let item: ExpiringItem

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.materialTitle)
                    .font(AppFont.body(14, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                Text(meta)
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                status
                Text(StockDate.short(item.expiryDate))
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .accessibilityElement(children: .combine)
    }

    private var meta: String {
        var parts = [item.isProduced ? "Produs" : "Materie primă", item.quantityText]
        if let location = item.locationName, !location.isEmpty { parts.append(location) }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private var status: some View {
        let days = item.daysUntilExpiry
        if days < 0 {
            HStatusChip("Expirat", kind: .danger)
        } else if days == 0 {
            HStatusChip("Azi", kind: .danger)
        } else if days == 1 {
            HStatusChip("Mâine", kind: .warning)
        } else if days <= 7 {
            HStatusChip("În \(days) zile", kind: .warning)
        } else {
            NeutralPill(title: "În \(RoCount.format(days, one: "zi", many: "zile"))")
        }
    }
}

#Preview {
    NavigationStack {
        ExpiryTrackingView()
    }
}
