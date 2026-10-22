import SwiftUI

/// The DRAFT confirmer: review every line (Scade / Produs nou / Ignoră), fix the
/// matched product, ± quantities (negative = retur în stoc), resolve shortfalls,
/// add lines by hand, then apply everything in ONE "Confirmă tot".
/// iOS twin of web `stock/sales/[id]` → `Confirmer`.
struct SalesDeductionConfirmerView: View {
    let onConfirmed: (SalesDeduction) -> Void

    @State private var viewModel: SalesDeductionConfirmViewModel
    @State private var showConfirmSheet = false
    @State private var showDiscardDialog = false
    @State private var pickerRowKey: String?
    @Environment(\.dismiss) private var dismiss

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }
    private var canWrite: Bool { permissions.can(.create, .StockMovement) }

    init(deduction: SalesDeduction, onConfirmed: @escaping (SalesDeduction) -> Void) {
        self.onConfirmed = onConfirmed
        _viewModel = State(initialValue: SalesDeductionConfirmViewModel(deduction: deduction))
    }

    var body: some View {
        List {
            introSection
            if let previous = viewModel.deduction.duplicateOf.first {
                duplicateSection(previousId: previous)
            }
            filterChips
            if viewModel.visibleRows.isEmpty {
                Section {
                    Text(viewModel.rows.isEmpty ? "Niciun produs încă — adaugă unul." : "Nimic în acest filtru.")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 88)
                }
            }
            ForEach(viewModel.visibleRows) { row in
                SalesLineEditorSection(
                    viewModel: viewModel,
                    rowKey: row.id,
                    onPickProduct: { pickerRowKey = row.id }
                )
            }
        }
        .listStyle(.insetGrouped)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Confirmă vânzările")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canWrite {
                ToolbarItem(placement: .primaryAction) {
                    Button { viewModel.addManualRow() } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Adaugă produs")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if canWrite { bottomBar }
        }
        .task { await viewModel.loadProducts() }
        // While the confirm sheet is up it shows the errors itself.
        .errorAlert(Binding(
            get: { showConfirmSheet ? nil : viewModel.error },
            set: { viewModel.error = $0 }
        ))
        .sensoryFeedback(.impact(weight: .light), trigger: viewModel.rows.count)
        .sheet(isPresented: Binding(
            get: { pickerRowKey != nil },
            set: { if !$0 { pickerRowKey = nil } }
        )) {
            if let key = pickerRowKey, let row = viewModel.row(key) {
                SalesProductPickerView(
                    products: viewModel.products,
                    candidates: row.candidates,
                    selectedId: row.recipeId
                ) { product in
                    viewModel.selectProduct(key, product)
                    pickerRowKey = nil
                }
            }
        }
        .sheet(isPresented: $showConfirmSheet) {
            SalesConfirmSheet(viewModel: viewModel) { confirmed in
                showConfirmSheet = false
                onConfirmed(confirmed)
            }
        }
        .confirmationDialog(
            "Renunți la această scădere?",
            isPresented: $showDiscardDialog,
            titleVisibility: .visible
        ) {
            Button("Renunță la scădere", role: .destructive) {
                Task { if await viewModel.discard() { dismiss() } }
            }
        } message: {
            Text("Ciorna se închide, iar stocul nu se modifică.")
        }
    }

    // MARK: - Sections

    private var introSection: some View {
        Section {
            Label(
                "\(viewModel.deduction.source.displayName) · \(viewModel.deduction.locationName)",
                systemImage: viewModel.deduction.source.icon
            )
            .font(.headline)
            if let fileName = viewModel.deduction.fileName {
                Text(fileName).font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
            }
        } footer: {
            Text("Verifică fiecare produs: acceptă, corectează, ignoră sau adaugă-l ca produs nou. Stocul se modifică doar după „Confirmă tot”.")
        }
    }

    private func duplicateSection(previousId: String) -> some View {
        Section {
            Label {
                Text("Acest fișier a mai fost confirmat o dată — confirmând din nou, vânzările se scad de două ori.")
                    .font(.subheadline)
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(AppTheme.Colors.warning)
            }
            NavigationLink(value: Route.salesDeductionDetail(id: previousId)) {
                Text("Vezi scăderea anterioară").foregroundStyle(AppTheme.Colors.primaryText)
            }
        }
        .listRowBackground(AppTheme.Colors.warning.opacity(0.12))
    }

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: AppTheme.Spacing.sm) {
                ForEach(SalesLineFilter.allCases) { f in
                    let selected = viewModel.filter == f
                    Button {
                        withAnimation(.spring(.snappy)) { viewModel.filter = f }
                    } label: {
                        Text("\(f.label) · \(viewModel.count(for: f))")
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, AppTheme.Spacing.md)
                            .frame(minHeight: 36)
                            .foregroundStyle(selected ? Color(.systemBackground) : .secondary)
                            .background(selected ? Color.primary : Color(.tertiarySystemFill), in: Capsule())
                            // 44pt hit target around the 36pt chip.
                            .padding(.vertical, AppTheme.Spacing.xs)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? [.isSelected] : [])
                }
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
        }
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
        .sensoryFeedback(.selection, trigger: viewModel.filter)
    }

    private var bottomBar: some View {
        VStack(spacing: AppTheme.Spacing.sm) {
            (Text("\(viewModel.acceptCount)").bold() + Text(" de scăzut · ")
                + Text("\(viewModel.createdCount)").bold() + Text(" noi · \(viewModel.declinedCount) ignorate")
                + (viewModel.unresolvedCount > 0
                    ? Text(" · \(viewModel.unresolvedCount) cu stoc insuficient").bold().foregroundColor(AppTheme.Colors.warning)
                    : Text("")))
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: AppTheme.Spacing.md) {
                Button("Renunță", role: .destructive) { showDiscardDialog = true }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(viewModel.isDiscarding)
                Button {
                    if viewModel.prepareConfirm() { showConfirmSheet = true }
                } label: {
                    Label("Confirmă tot", systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.Colors.primary)
                .controlSize(.large)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.vertical, AppTheme.Spacing.md)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
    }
}
