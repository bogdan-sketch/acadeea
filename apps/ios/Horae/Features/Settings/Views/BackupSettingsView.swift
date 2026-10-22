import SwiftUI
import UIKit

// MARK: - Screen

/// Setari → Administrare → "Backup & Restaurare" (doar admini, `manage all`).
///
/// Echivalentul paginii web `settings/backups`: salvare manuala a starii
/// organizatiei, lista snapshot-urilor (automate + manuale), restaurare
/// dublu-gardata, descarcare `.json.gz` si stergerea celor manuale.
///
/// Toate prezentarile (detaliu, share sheet, alerte) sunt ancorate AICI, iar
/// foaia de detaliu se inchide inainte de a porni o actiune — asa nu se bat
/// doua prezentari pe acelasi ecran si erorile ajung mereu vizibile.
struct BackupSettingsView: View {
    @State private var viewModel = BackupViewModel()

    /// Salvare manuala — alerta cu eticheta optionala.
    @State private var showLabelPrompt = false
    @State private var newLabel = ""

    /// Snapshot-ul deschis in foaia de detaliu.
    @State private var detailSnapshot: OrgSnapshot?
    /// Snapshot-ul propus spre stergere (confirmare la nivel de lista).
    @State private var deleteTarget: OrgSnapshot?

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    var body: some View {
        Group {
            if permissions.isAdmin {
                content
            } else {
                // Intrarea e ascunsa din Setari pentru non-admini; asta e doar
                // plasa de siguranta daca ruta e atinsa altfel.
                EmptyStateView(
                    title: "Acces restrictionat",
                    systemImage: "lock",
                    subtitle: "Doar administratorii organizației pot gestiona backup-urile."
                )
            }
        }
        .navigationTitle("Backup & Restaurare")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var content: some View {
        List {
            manualSaveSection
            snapshotsSection
        }
        .listStyle(.insetGrouped)
        .appScreenBackground()
        .refreshable { await Task { await viewModel.load() }.value }
        .task {
            guard viewModel.snapshots.isEmpty else { return }
            await viewModel.load()
        }
        .overlay { if viewModel.isRestoring { restoringOverlay } }
        .alert("Salvează starea", isPresented: $showLabelPrompt) {
            TextField("Eticheta (optional)", text: $newLabel)
                .textInputAutocapitalization(.sentences)
            Button("Salvează") {
                let label = newLabel
                newLabel = ""
                Task { await viewModel.createSnapshot(label: label) }
            }
            Button("Anulează", role: .cancel) { newLabel = "" }
        } message: {
            Text("Poți eticheta salvarea ca să o recunoști mai târziu, de exemplu „înainte de inventar\".")
        }
        .confirmationDialog(
            "Stergi backup-ul?",
            isPresented: Binding(
                get: { deleteTarget != nil },
                set: { if !$0 { deleteTarget = nil } }
            ),
            titleVisibility: .visible,
            presenting: deleteTarget
        ) { snapshot in
            Button("Șterge backup-ul", role: .destructive) {
                deleteTarget = nil
                Task { await viewModel.delete(snapshot) }
            }
            Button("Anulează", role: .cancel) { deleteTarget = nil }
        } message: { snapshot in
            Text("Backup-ul din \(snapshot.displayDate) va fi șters definitiv.")
        }
        .sheet(item: $detailSnapshot) { snapshot in
            NavigationStack {
                SnapshotDetailSheet(
                    snapshot: snapshot,
                    onDownload: { snap in Task { await viewModel.download(snap) } },
                    onRestore: { snap in
                        Task {
                            guard await viewModel.restore(snap) else { return }
                            await viewModel.finishRestoreLogout()
                        }
                    },
                    onDelete: { snap in Task { await viewModel.delete(snap) } }
                )
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $viewModel.shareItem) { item in
            ShareSheet(url: item.url)
        }
        .errorAlert($viewModel.error)
        .sensoryFeedback(.success, trigger: viewModel.shareItem?.id)
    }

    // MARK: Restore overlay

    /// Restaurarea ruleaza server-side intr-o singura tranzactie si poate dura —
    /// blocam ecranul ca sa nu se porneasca o a doua actiune peste ea.
    private var restoringOverlay: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea()
            VStack(spacing: AppTheme.Spacing.md) {
                ProgressView()
                Text("Se restaurează datele…")
                    .font(.subheadline.weight(.medium))
                Text("Nu închide aplicația.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(AppTheme.Spacing.xl)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.lg))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Se restaurează datele organizației")
    }

    // MARK: Manual save

    private var manualSaveSection: some View {
        Section {
            Button {
                newLabel = ""
                showLabelPrompt = true
            } label: {
                HStack(spacing: AppTheme.Spacing.md) {
                    Label("Salvează starea acum", systemImage: "externaldrive.badge.plus")
                    Spacer(minLength: 0)
                    if viewModel.isCreating {
                        ProgressView()
                    }
                }
                .contentShape(Rectangle())
            }
            .disabled(viewModel.isBusy)
        } header: {
            Text("Salvează starea organizației")
        } footer: {
            Text("Un backup se face automat în fiecare noapte la 01:30 (se păstrează ultimele 30). Poți salva manual starea oricând — de exemplu înainte de un inventar sau de o modificare mare.")
        }
    }

    // MARK: Snapshot list

    private var snapshotsSection: some View {
        Section("Backup-uri salvate") {
            if viewModel.isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding(.vertical, AppTheme.Spacing.md)
                .listRowBackground(Color.clear)
            } else if viewModel.snapshots.isEmpty {
                Text("Niciun backup încă — primul se face automat la noapte sau salvează manual starea acum.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ForEach(viewModel.snapshots) { snapshot in
                    Button {
                        detailSnapshot = snapshot
                    } label: {
                        SnapshotRow(
                            snapshot: snapshot,
                            isBusy: viewModel.busySnapshotId == snapshot.id
                        )
                    }
                    .buttonStyle(.plain)
                    .contentShape(Rectangle())
                    .accessibilityHint("Deschide detaliile și acțiunile backup-ului")
                    .contextMenu {
                        Button {
                            detailSnapshot = snapshot
                        } label: {
                            Label("Detalii", systemImage: "info.circle")
                        }
                        Button {
                            Task { await viewModel.download(snapshot) }
                        } label: {
                            Label("Descarcă fișierul", systemImage: "arrow.down.circle")
                        }
                        if !snapshot.auto {
                            Button(role: .destructive) {
                                deleteTarget = snapshot
                            } label: {
                                Label("Șterge", systemImage: "trash")
                            }
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        if !snapshot.auto {
                            Button(role: .destructive) {
                                deleteTarget = snapshot
                            } label: {
                                Label("Șterge", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Row

private struct SnapshotRow: View {
    let snapshot: OrgSnapshot
    let isBusy: Bool

    var body: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            Image(systemName: snapshot.auto ? "clock.arrow.circlepath" : "externaldrive.fill")
                .font(.title3)
                .foregroundStyle(AppTheme.Colors.primaryText)
                .frame(width: 28)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                HStack(spacing: AppTheme.Spacing.sm) {
                    Text(snapshot.displayDate)
                        .font(.subheadline.weight(.medium))
                    if snapshot.auto {
                        StatusBadge(text: "Automat", color: .secondary)
                    }
                }
                if let label = snapshot.displayLabel {
                    Text(label)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            if isBusy {
                ProgressView()
            } else {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, AppTheme.Spacing.xxs)
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String {
        var parts = [snapshot.displaySize]
        if let name = snapshot.createdByName, !name.isEmpty { parts.append("de \(name)") }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Detail sheet

/// Detaliul unui backup + cele trei actiuni. Restaurarea traieste DOAR aici (nu
/// in meniul contextual) ca sa nu fie la un tap distanta din lista. Fiecare
/// actiune inchide foaia si o preda parintelui, care detine starea si erorile.
private struct SnapshotDetailSheet: View {
    let snapshot: OrgSnapshot
    let onDownload: (OrgSnapshot) -> Void
    let onRestore: (OrgSnapshot) -> Void
    let onDelete: (OrgSnapshot) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var showRestoreConfirm = false
    @State private var confirmText = ""
    @State private var showDeleteConfirm = false
    @State private var warningFeedback = 0

    var body: some View {
        List {
            infoSection
            if !snapshot.summaryLines.isEmpty { summarySection }
            actionsSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle(snapshot.auto ? "Backup automat" : "Backup manual")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Închide") { dismiss() }
            }
        }
        // Guard 2: butonul rosu se activeaza doar dupa ce utilizatorul tasteaza
        // exact cuvantul de confirmare.
        .alert("Restaurează datele organizației", isPresented: $showRestoreConfirm) {
            TextField(BackupViewModel.confirmWord, text: $confirmText)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
            Button("Restaurează", role: .destructive) {
                confirmText = ""
                dismiss()
                onRestore(snapshot)
            }
            .disabled(confirmText != BackupViewModel.confirmWord)
            Button("Anulează", role: .cancel) { confirmText = "" }
        } message: {
            Text("Toate datele organizației revin la starea din \(snapshot.displayDate). Modificările făcute după acest moment se pierd definitiv. Toți utilizatorii vor fi delogați.\n\nScrie \(BackupViewModel.confirmWord) pentru a confirma.")
        }
        .confirmationDialog(
            "Stergi backup-ul?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Șterge backup-ul", role: .destructive) {
                dismiss()
                onDelete(snapshot)
            }
            Button("Anulează", role: .cancel) {}
        } message: {
            Text("Backup-ul din \(snapshot.displayDate) va fi șters definitiv.")
        }
        .sensoryFeedback(.warning, trigger: warningFeedback)
    }

    // MARK: Sections

    private var infoSection: some View {
        Section {
            LabeledContent("Data", value: snapshot.displayDate)
            LabeledContent("Tip", value: snapshot.auto ? "Automat" : "Manual")
            if let label = snapshot.displayLabel {
                LabeledContent("Eticheta", value: label)
            }
            LabeledContent("Mărime", value: snapshot.displaySize)
            if let name = snapshot.createdByName, !name.isEmpty {
                LabeledContent("Creat de", value: name)
            }
        }
    }

    private var summarySection: some View {
        Section("Conținut") {
            ForEach(snapshot.summaryLines, id: \.self) { line in
                Text(line)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var actionsSection: some View {
        Section {
            Button {
                dismiss()
                onDownload(snapshot)
            } label: {
                Label("Descarcă fișierul", systemImage: "arrow.down.circle")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }

            // Guard 1: actiunea distructiva sta in detaliu, in spatele unei
            // confirmari explicite cu tot ce se pierde.
            Button(role: .destructive) {
                confirmText = ""
                warningFeedback += 1
                showRestoreConfirm = true
            } label: {
                Label("Restaurează la această stare", systemImage: "arrow.counterclockwise")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }

            if !snapshot.auto {
                Button(role: .destructive) {
                    showDeleteConfirm = true
                } label: {
                    Label("Șterge backup-ul", systemImage: "trash")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
            }
        } footer: {
            Text("Restaurarea înlocuiește toate datele organizației cu cele din acest backup și deloghează toți utilizatorii. Descărcarea fisierului este permisă doar administratorilor platformei.")
        }
    }
}

// MARK: - Share sheet

/// `UIActivityViewController` — singura cale de a DESCHIDE share sheet-ul
/// programatic dupa ce descarcarea s-a terminat (`ShareLink` are nevoie de un
/// tap pe el, iar fisierul nu exista pana atunci).
private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

#Preview {
    NavigationStack {
        BackupSettingsView()
    }
}
