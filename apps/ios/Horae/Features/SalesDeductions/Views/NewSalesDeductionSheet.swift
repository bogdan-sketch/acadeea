import SwiftUI
import UniformTypeIdentifiers

/// "Scădere nouă din vânzări": 1. locația, 2. sursa (Excel eBriza / manual / site).
/// Creates a DRAFT — nothing touches stock until the confirmer's "Confirmă tot".
struct NewSalesDeductionSheet: View {
    let onCreated: (SalesDeduction) -> Void

    @State private var viewModel = NewSalesDeductionViewModel()
    @State private var showFileImporter = false
    @Environment(\.dismiss) private var dismiss

    /// .xlsx + .csv (eBriza exports). Legacy .xls is accepted so the server can
    /// explain "save it as .xlsx" instead of the picker silently greying it out.
    private static let allowedTypes: [UTType] = [
        UTType("org.openxmlformats.spreadsheetml.sheet") ?? UTType(filenameExtension: "xlsx") ?? .spreadsheet,
        .commaSeparatedText,
        UTType("com.microsoft.excel.xls") ?? .spreadsheet,
    ]

    var body: some View {
        NavigationStack {
            Form {
                locationSection
                sourceSection
                switch viewModel.source {
                case .EXCEL: excelSection
                case .WOOCOMMERCE: wooSection
                case .MANUAL: EmptyView()
                }
            }
            .navigationTitle("Scădere nouă")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .task { await viewModel.loadLocations() }
            .errorAlert($viewModel.error)
            .interactiveDismissDisabled(viewModel.isBusy)
            .fileImporter(
                isPresented: $showFileImporter,
                allowedContentTypes: Self.allowedTypes,
                allowsMultipleSelection: false
            ) { result in
                if case .success(let urls) = result, let url = urls.first {
                    viewModel.pickFile(at: url)
                }
            }
            .sensoryFeedback(.selection, trigger: viewModel.source)
        }
    }

    // MARK: - Sections

    private var locationSection: some View {
        Section("1. Locația de unde se scade stocul") {
            if viewModel.locations.isEmpty {
                ProgressView().frame(maxWidth: .infinity)
            } else {
                OptionalChoiceChips(
                    options: viewModel.locations.map(\.id),
                    title: { id in viewModel.locations.first { $0.id == id }?.name ?? "" },
                    selection: $viewModel.locationId,
                    accessibilityLabel: "Locație"
                )
            }
        }
    }

    private var sourceSection: some View {
        Section("2. De unde vin vânzările") {
            SalesSourceOptionRow(
                title: "Încarcă Excel",
                hint: "Raportul de vânzări exportat din eBriza (.xlsx sau .csv)",
                icon: SalesDeductionSource.EXCEL.icon,
                isSelected: viewModel.source == .EXCEL
            ) { viewModel.source = .EXCEL }
            SalesSourceOptionRow(
                title: "Manual",
                hint: "Alegi produsele și cantitățile vândute direct în aplicație",
                icon: SalesDeductionSource.MANUAL.icon,
                isSelected: viewModel.source == .MANUAL
            ) { viewModel.source = .MANUAL }
            SalesSourceOptionRow(
                title: "De pe site",
                hint: "Comenzile WooCommerce (processing/completed) dintr-un interval",
                icon: SalesDeductionSource.WOOCOMMERCE.icon,
                isSelected: viewModel.source == .WOOCOMMERCE
            ) { viewModel.source = .WOOCOMMERCE }
        }
    }

    private var excelSection: some View {
        Section {
            Button { showFileImporter = true } label: {
                Label {
                    Text(viewModel.file?.name ?? "Alege fișierul exportat din eBriza")
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .foregroundStyle(viewModel.file == nil ? AppTheme.Colors.primaryText : Color.primary)
                } icon: {
                    Image(systemName: viewModel.file == nil ? "doc.badge.plus" : "doc.fill")
                        .foregroundStyle(AppTheme.Colors.primaryText)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .accessibilityHint("Deschide selectorul de fișiere")

            // Șablon pentru scoateri manuale: toate produsele, cantitatea goală.
            if let url = viewModel.templateURL {
                ShareLink(item: url) {
                    Label("Trimite șablonul CSV", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
            } else {
                Button {
                    Task { await viewModel.downloadTemplate() }
                } label: {
                    Label("Descarcă șablonul CSV (toate produsele)", systemImage: "arrow.down.doc")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .disabled(viewModel.locationId == nil || viewModel.isBusy)
            }
        } footer: {
            Text("Căutăm automat coloanele „Denumire/Produs” și „Cantitate”. Nimic nu se scade până nu confirmi. Șablonul are toate produsele cu numele exact; completezi doar cantitatea.")
        }
    }

    private var wooSection: some View {
        Section {
            DatePicker("De la", selection: $viewModel.from, displayedComponents: .date)
                .environment(\.locale, RoDate.locale)
                .environment(\.calendar, RoDate.calendar)
            DatePicker("Până la", selection: $viewModel.to, in: viewModel.from..., displayedComponents: .date)
                .environment(\.locale, RoDate.locale)
                .environment(\.calendar, RoDate.calendar)
        } footer: {
            Label(
                "Atenție: comenzile de pe site devin și comenzi de producție. Scade de aici doar produsele luate din stocul de raft, ca să nu scazi de două ori.",
                systemImage: "exclamationmark.triangle.fill"
            )
            .foregroundStyle(AppTheme.Colors.warning)
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Renunță") { dismiss() }
                .disabled(viewModel.isBusy)
        }
        ToolbarItem(placement: .confirmationAction) {
            if viewModel.isBusy {
                ProgressView()
            } else {
                Button("Continuă") {
                    Task {
                        if let created = await viewModel.create() { onCreated(created) }
                    }
                }
                .disabled(!viewModel.canContinue)
            }
        }
    }
}

/// A radio-style source choice row (icon + title + hint + checkmark).
private struct SalesSourceOptionRow: View {
    let title: String
    let hint: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(isSelected ? AppTheme.Colors.primaryText : .secondary)
                    .frame(width: 28)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text(title).font(.headline).foregroundStyle(.primary)
                    Text(hint).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: AppTheme.Spacing.sm)
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                        .accessibilityHidden(true)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

#Preview {
    NewSalesDeductionSheet { _ in }
}
