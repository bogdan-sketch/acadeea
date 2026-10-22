import SwiftUI

/// One sales deduction: the confirmer while DRAFT, the read-only log entry
/// (with "Anulează scăderea") once confirmed or reverted.
struct SalesDeductionDetailView: View {
    @State private var viewModel: SalesDeductionDetailViewModel

    init(deductionId: String) {
        _viewModel = State(initialValue: SalesDeductionDetailViewModel(deductionId: deductionId))
    }

    var body: some View {
        Group {
            if let deduction = viewModel.deduction {
                if deduction.status == .DRAFT {
                    SalesDeductionConfirmerView(deduction: deduction) { confirmed in
                        withAnimation(.spring(.smooth)) { viewModel.deduction = confirmed }
                    }
                    // A fresh confirmer (fresh rows) per draft instance.
                    .id(deduction.id)
                } else {
                    SalesDeductionLogDetailView(viewModel: viewModel, deduction: deduction)
                }
            } else if let loadError = viewModel.loadError {
                ContentUnavailableView(loadError, systemImage: "exclamationmark.triangle")
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task { await viewModel.load() }
    }
}

/// Confirmed / reverted deduction: header, summary, per-line table, revert.
struct SalesDeductionLogDetailView: View {
    @Bindable var viewModel: SalesDeductionDetailViewModel
    let deduction: SalesDeduction

    @State private var showRevertAlert = false
    @State private var revertSucceeded = false

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    var body: some View {
        List {
            headerSection
            Section("Produse") {
                ForEach(deduction.lines ?? []) { line in
                    SalesLogLineRow(line: line)
                }
            }
            if deduction.status == .CONFIRMED && permissions.can(.create, .StockMovement) {
                Section {
                    Button(role: .destructive) { showRevertAlert = true } label: {
                        Label("Anulează scăderea", systemImage: "arrow.uturn.backward")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .disabled(viewModel.isReverting)
                } footer: {
                    Text("Cantitățile scăzute se pun înapoi în stocul din \(deduction.locationName).")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(deduction.source.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if viewModel.isReverting { ProgressView("Se anulează...") } }
        .errorAlert($viewModel.error)
        .sensoryFeedback(.success, trigger: revertSucceeded)
        .alert("Anulezi scăderea?", isPresented: $showRevertAlert) {
            Button("Nu", role: .cancel) {}
            Button("Da, anulează", role: .destructive) {
                Task { if await viewModel.revert() { revertSucceeded.toggle() } }
            }
        } message: {
            Text("Cantitățile scăzute se pun înapoi în stocul din \(deduction.locationName) (peste stocul de acum). Produsele noi create din raport rămân în aplicație.")
        }
    }

    private var headerSection: some View {
        Section {
            LabeledContent("Status") { StatusBadge(salesStatus: deduction.status) }
            LabeledContent("Locație", value: deduction.locationName)
            if let confirmedAt = deduction.confirmedAt {
                LabeledContent("Confirmată", value: confirmedAt.dottedDateTime)
            }
            if let by = deduction.confirmedByName {
                LabeledContent("De către", value: by)
            }
            if let revertedAt = deduction.revertedAt {
                LabeledContent("Anulată", value: revertedAt.dottedDateTime)
            }
            if let fileName = deduction.fileName {
                LabeledContent("Fișier", value: fileName)
            }
            if let note = deduction.note, !note.isEmpty {
                LabeledContent("Notă", value: note)
            }
        } footer: {
            let s = deduction.summary
            Text("\(s.accepted) scăzute · \(s.created) noi · \(s.declined) ignorate" + (s.shortfalls > 0 ? " · \(s.shortfalls) cu stoc insuficient" : ""))
        }
    }
}

/// Read-only line: report name, product, sold quantity, stock before → after, notes.
private struct SalesLogLineRow: View {
    let line: SalesDeductionLine

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text(line.rawName).font(.headline)
                Spacer(minLength: AppTheme.Spacing.sm)
                if line.decision == .ACCEPT, let q = line.quantity {
                    Text(q.qtyFormatted).font(.headline.monospacedDigit())
                }
            }
            if let reported = line.quantityReported {
                Text("raport: \(reported.qtyFormatted) \(line.rawUnit ?? "")")
                    .font(.caption).foregroundStyle(.secondary)
            }
            HStack {
                Text(line.recipeName ?? "—").font(.subheadline)
                Spacer(minLength: AppTheme.Spacing.sm)
                if let before = line.stockBefore {
                    Text("stoc \(before.qtyFormatted) → \((line.stockAfter ?? 0).qtyFormatted)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            if !observation.isEmpty {
                Text(observation)
                    .font(.caption)
                    .foregroundStyle((line.shortfall ?? 0) > 0 ? AppTheme.Colors.warning : .secondary)
            }
        }
        .opacity(line.decision == .DECLINE ? 0.6 : 1)
        .padding(.vertical, AppTheme.Spacing.xxs)
        .accessibilityElement(children: .combine)
    }

    private var observation: String {
        switch line.decision {
        case .DECLINE: return "ignorat"
        case .CREATE_NEW: return "produs nou creat"
        case .ACCEPT:
            var parts: [String] = []
            if let s = line.shortfall, s > 0 { parts.append("stoc insuficient, lipsă \(s.qtyFormatted)") }
            if let o = line.stockOverride { parts.append("stoc suprascris la \(o.qtyFormatted)") }
            if let q = line.quantity, q < 0 { parts.append("adăugat înapoi") }
            return parts.joined(separator: " · ")
        }
    }
}

#Preview {
    NavigationStack {
        SalesDeductionDetailView(deductionId: "preview")
    }
}
