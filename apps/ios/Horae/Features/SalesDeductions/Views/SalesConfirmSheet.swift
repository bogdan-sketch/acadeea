import SwiftUI

/// "Confirmă toate modificările": grouped summary of what will happen, one
/// checkbox to acknowledge every unresolved shortfall (clamped to 0), optional
/// note, then a single confirm. Mirrors web `ConfirmDialog`.
struct SalesConfirmSheet: View {
    @Bindable var viewModel: SalesDeductionConfirmViewModel
    let onDone: (SalesDeduction) -> Void

    @State private var note = ""
    @State private var ackAll = false
    @State private var succeeded = false
    @Environment(\.dismiss) private var dismiss

    private var accepted: [SalesLineDraft] { viewModel.rows.filter { $0.decision == .ACCEPT } }
    private var unresolved: [SalesLineDraft] { accepted.filter { viewModel.computed[$0.id]?.unresolved == true } }
    private var clamped: [SalesLineDraft] {
        accepted.filter { $0.stockMode == .clamp && (viewModel.computed[$0.id]?.shortfall ?? 0) > 0 }
    }
    private var overrides: [SalesLineDraft] { accepted.filter { $0.stockMode == .override } }
    private var normal: [SalesLineDraft] {
        let special = Set((unresolved + clamped + overrides).map(\.id))
        return accepted.filter { !special.contains($0.id) }
    }
    private var created: [SalesLineDraft] { viewModel.rows.filter { $0.decision == .CREATE_NEW } }
    private var declined: [SalesLineDraft] { viewModel.rows.filter { $0.decision == .DECLINE } }
    private var blocked: Bool { !unresolved.isEmpty && !ackAll }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("\(viewModel.deduction.locationName) · totul se aplică într-un singur pas și primești o singură notificare cu rezumatul.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                summary("Stoc insuficient — nerezolvat", unresolved, tint: AppTheme.Colors.warning) { r in
                    let c = viewModel.computed[r.id]
                    return "vândut \((c?.qty ?? 0).qtyFormatted), stoc \((c?.before ?? 0).qtyFormatted)"
                }
                if !unresolved.isEmpty {
                    Section {
                        Toggle(isOn: $ackAll) {
                            Text("Am înțeles: pentru aceste \(unresolved.count) produse se scade cât e în stoc (ajung la 0), iar vânzarea rămâne înregistrată integral.")
                                .font(.subheadline)
                        }
                        .tint(AppTheme.Colors.primary)
                    }
                    .listRowBackground(AppTheme.Colors.warning.opacity(0.12))
                }
                summary("Aduse la 0 (stoc insuficient, confirmat)", clamped, tint: AppTheme.Colors.warning, detail: qtyText)
                summary("Stoc suprascris", overrides, tint: .blue) { r in
                    "stoc nou: \((SalesNumber.parse(r.override) ?? 0).qtyFormatted)"
                }
                summary("Produse noi", created, tint: .blue) { r in "stoc: \(r.newStock.isEmpty ? "0" : r.newStock)" }
                summary("Se scad normal", normal, tint: nil, detail: qtyText)
                summary("Ignorate", declined, tint: nil) { _ in "—" }
                Section("Notă (opțional)") {
                    TextField("Notă", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                }
                Section {
                    Button {
                        Task {
                            if let result = await viewModel.confirm(note: note, ackAll: ackAll) {
                                succeeded = true
                                onDone(result)
                            }
                        }
                    } label: {
                        Group {
                            if viewModel.isConfirming {
                                ProgressView()
                            } else {
                                Text("Confirmă și actualizează stocul").bold()
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.Colors.primary)
                    .disabled(viewModel.isConfirming || blocked)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("Confirmă toate modificările")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Înapoi") { dismiss() }
                        .disabled(viewModel.isConfirming)
                }
            }
            .interactiveDismissDisabled(viewModel.isConfirming)
            .errorAlert($viewModel.error)
            .sensoryFeedback(.success, trigger: succeeded)
            .sensoryFeedback(.warning, trigger: ackAll) { _, new in new }
        }
    }

    private func qtyText(_ r: SalesLineDraft) -> String {
        let c = viewModel.computed[r.id]
        let q = c?.qty ?? 0
        let signed = q < 0 ? "+\((-q).qtyFormatted)" : "−\(q.qtyFormatted)"
        return "\(signed) · \((c?.before ?? 0).qtyFormatted) → \((c?.after ?? 0).qtyFormatted)"
    }

    @ViewBuilder
    private func summary(
        _ title: String,
        _ items: [SalesLineDraft],
        tint: Color?,
        detail: @escaping (SalesLineDraft) -> String
    ) -> some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { r in
                    LabeledContent(viewModel.name(of: r)) {
                        Text(detail(r)).monospacedDigit()
                    }
                    .font(.subheadline)
                }
            } header: {
                Text("\(title) · \(items.count)")
                    .foregroundStyle(tint ?? .secondary)
            }
        }
    }
}
