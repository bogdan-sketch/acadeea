import SwiftUI

/// Setari → Administrare → "Resetare date" (doar admini, `manage all`).
///
/// Echivalentul paginii web `settings/reset`: liste de categorii cu numarul
/// de randuri, dependente bifate automat, zona separata pentru datele de baza
/// (retete, materii prime) si confirmare dublu-gardata.
struct DataResetView: View {
    @State private var viewModel = DataResetViewModel()
    @State private var showConfirm = false
    @State private var confirmText = ""
    @State private var warningFeedback = 0

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    var body: some View {
        Group {
            if permissions.isAdmin {
                content
            } else {
                EmptyStateView(
                    title: "Acces restrictionat",
                    systemImage: "lock",
                    subtitle: "Doar administratorii organizației pot reseta datele."
                )
            }
        }
        .navigationTitle("Resetare date")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var content: some View {
        List {
            backupNoteSection
            operationalSection
            dangerSection
            runSection
        }
        .listStyle(.insetGrouped)
        .appScreenBackground()
        .refreshable { await Task { await viewModel.load() }.value }
        .task {
            guard viewModel.categories.isEmpty else { return }
            await viewModel.load()
        }
        .overlay { if viewModel.isRunning { runningOverlay } }
        .alert("Resetezi datele selectate?", isPresented: $showConfirm) {
            TextField(DataResetViewModel.confirmWord, text: $confirmText)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
            Button("Resetează", role: .destructive) {
                confirmText = ""
                Task { _ = await viewModel.run() }
            }
            .disabled(confirmText != DataResetViewModel.confirmWord)
            Button("Anulează", role: .cancel) { confirmText = "" }
        } message: {
            Text(confirmMessage)
        }
        .errorAlert($viewModel.error)
        .sensoryFeedback(.warning, trigger: warningFeedback)
    }

    private var confirmMessage: String {
        let names = viewModel.effective.map(\.label).joined(separator: ", ")
        var text = "Se șterg definitiv \(viewModel.effectiveTotal) înregistrări din: \(names)."
        if viewModel.includesDanger {
            text += "\n\nInclude date de bază (rețete / materii prime)."
        }
        text += "\n\nÎnainte se salvează automat un backup. Scrie \(DataResetViewModel.confirmWord) pentru a confirma."
        return text
    }

    // MARK: Sections

    private var backupNoteSection: some View {
        Section {
            Label {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text("Se face backup automat înainte")
                        .font(.subheadline.weight(.medium))
                    Text("Starea organizației se salvează în Backup & Restaurare înainte de orice resetare. Dacă te răzgândești, poți restaura de acolo.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: "externaldrive.badge.checkmark")
                    .foregroundStyle(AppTheme.Colors.primaryText)
            }
        }
    }

    private var operationalSection: some View {
        Section("Date operationale") {
            if viewModel.isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding(.vertical, AppTheme.Spacing.md)
                .listRowBackground(Color.clear)
            } else {
                ForEach(viewModel.operational) { category in
                    categoryRow(category)
                }
            }
        }
    }

    @ViewBuilder
    private var dangerSection: some View {
        if !viewModel.isLoading, !viewModel.danger.isEmpty {
            Section {
                ForEach(viewModel.danger) { category in
                    categoryRow(category)
                }
            } header: {
                Label("Date de baza", systemImage: "exclamationmark.shield")
                    .foregroundStyle(.red)
            } footer: {
                Text("Rețetele și materiile prime nu se șterg niciodată implicit — doar dacă le bifezi aici. Ștergerea lor include automat datele care depind de ele.")
            }
        }
    }

    private var runSection: some View {
        Section {
            Button(role: .destructive) {
                confirmText = ""
                warningFeedback += 1
                showConfirm = true
            } label: {
                HStack {
                    Label("Resetează selecția", systemImage: "eraser")
                    Spacer(minLength: 0)
                    if viewModel.effectiveTotal > 0 {
                        Text("\(viewModel.effectiveTotal)")
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
                .contentShape(Rectangle())
            }
            .disabled(viewModel.isLoading || viewModel.isRunning || viewModel.effective.isEmpty)
        } footer: {
            if viewModel.effective.isEmpty {
                Text("Nimic selectat.")
            } else {
                Text(viewModel.effective.map(\.label).joined(separator: ", "))
            }
        }
    }

    // MARK: Row

    private func categoryRow(_ category: ResetCategoryPreview) -> some View {
        let implied = viewModel.isImplied(category)
        return Toggle(isOn: Binding(
            get: { viewModel.isChecked(category) },
            set: { viewModel.setSelected(category, $0) }
        )) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                HStack(spacing: AppTheme.Spacing.sm) {
                    Text(category.label)
                        .font(.subheadline.weight(.medium))
                    StatusBadge(
                        text: "\(category.total)",
                        color: category.total > 0 ? AppTheme.Colors.primary : .secondary
                    )
                    if implied {
                        StatusBadge(text: "inclus automat", color: .secondary)
                    }
                }
                Text(category.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !category.countLines.isEmpty {
                    Text(category.countLines)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .disabled(implied || viewModel.isRunning)
        .tint(category.danger ? .red : AppTheme.Colors.primary)
    }

    // MARK: Running overlay

    private var runningOverlay: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea()
            VStack(spacing: AppTheme.Spacing.md) {
                ProgressView()
                Text("Se resetează datele…")
                    .font(.subheadline.weight(.medium))
                Text("Se salvează backup-ul, apoi se șterg datele. Nu închide aplicația.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(AppTheme.Spacing.xl)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.lg))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Se resetează datele organizației")
    }
}

#Preview {
    NavigationStack {
        DataResetView()
    }
}
