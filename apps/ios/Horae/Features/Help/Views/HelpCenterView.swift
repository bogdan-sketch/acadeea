import SwiftUI

/// "Centru de ajutor" — the same curated content as the live coachmarks, read
/// as text. Grouped by category, searchable over titles + bodies, and every
/// flow can launch its live walkthrough with "Porneste turul".
///
/// Always reachable from Setari → Functionalitati (read-along text is useful to
/// everyone); the contextual hints themselves are gated by the per-user
/// "Mod tutorial" toggle in Setari → Preferinte.
struct HelpCenterView: View {
    @State private var center = TutorialCenter.shared
    @State private var query = ""
    @State private var expandedFlowId: String?

    private var results: [TutorialFlow] {
        center.flows.filter { $0.matches(query: query) }
    }

    private var categories: [String] {
        var seen = Set<String>()
        return results.compactMap { seen.insert($0.category).inserted ? $0.category : nil }
    }

    var body: some View {
        List {
            // The two on-demand mechanics are invisible until you know they
            // exist — say them once, here, while the mode is on.
            if center.enabled {
                Section("Sfaturi contextuale") {
                    Label(
                        "Ține apăsat pe un câmp ca să-i vezi sfatul oricând, chiar dacă l-ai ascuns deja.",
                        systemImage: "hand.tap"
                    )
                    Label(
                        "Butonul „Ascunde sfaturile” oprește sfaturile doar pe ecranul curent — revin când îl deschizi din nou.",
                        systemImage: "eye.slash"
                    )
                }
                .font(.footnote)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }

            ForEach(categories, id: \.self) { category in
                Section(category) {
                    ForEach(results.filter { $0.category == category }) { flow in
                        flowRow(flow)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .appScreenBackground()
        .navigationTitle("Centru de ajutor")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Caută în ghiduri")
        .overlay {
            if center.isLoading && center.flows.isEmpty {
                ProgressView()
            } else if !center.isLoading && results.isEmpty {
                EmptyStateView(
                    title: query.isEmpty ? "Niciun ghid disponibil" : "Niciun rezultat",
                    systemImage: "questionmark.circle",
                    subtitle: query.isEmpty
                        ? "Ghidurile se încarcă de pe server."
                        : "Încearcă alt cuvânt cheie."
                )
            }
        }
        .task { await center.loadContentIfNeeded() }
    }

    @ViewBuilder
    private func flowRow(_ flow: TutorialFlow) -> some View {
        let isExpanded = expandedFlowId == flow.id

        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Button {
                withAnimation(.spring(duration: 0.25)) {
                    expandedFlowId = isExpanded ? nil : flow.id
                }
            } label: {
                HStack(spacing: AppTheme.Spacing.sm) {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                        Text(flow.title)
                            .font(.headline)
                            .foregroundStyle(AppTheme.Colors.label)
                            .multilineTextAlignment(.leading)
                        Text("\(flow.steps.count) pași")
                            .font(.caption)
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                }
                .contentShape(Rectangle())
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityHint(isExpanded ? "Ascunde pasii" : "Arata pasii")

            if isExpanded {
                ForEach(Array(flow.steps.enumerated()), id: \.element.id) { index, step in
                    HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                        Text("\(index + 1)")
                            .font(.caption2.bold())
                            .foregroundStyle(AppTheme.Colors.label)
                            .frame(width: 20, height: 20)
                            .background(AppTheme.Colors.primary.opacity(0.14), in: Circle())
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                            Text(step.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(AppTheme.Colors.label)
                            Text(step.body)
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }

                Button {
                    center.start(flowId: flow.id)
                } label: {
                    Label("Porneste turul", systemImage: "play.circle")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Afiseaza pasii ca indicatii peste ecranele aplicatiei")
            }
        }
        .padding(.vertical, AppTheme.Spacing.xxs)
    }
}

#Preview {
    NavigationStack { HelpCenterView() }
}
