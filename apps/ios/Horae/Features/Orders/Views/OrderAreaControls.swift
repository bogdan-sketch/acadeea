import SwiftUI

// MARK: - Pregătiri | Intrări

/// The orders area's view switch, shown on the list AND the calendar. Same
/// two-segment look as the Rețete type switch.
struct OrderViewSegmented: View {
    let selection: OrderAreaView
    let onSelect: (OrderAreaView) -> Void

    var body: some View {
        HStack(spacing: 2) {
            ForEach(OrderAreaView.allCases) { segment($0) }
        }
        .padding(4)
        .background(AppTheme.Colors.border.opacity(0.7), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func segment(_ view: OrderAreaView) -> some View {
        let isOn = selection == view
        return Button {
            if !isOn { onSelect(view) }
        } label: {
            Text(view.displayName)
                .font(AppFont.body(14, weight: .bold))
                .foregroundStyle(isOn ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 36)
                .background {
                    if isOn {
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(AppTheme.Colors.card)
                            .shadow(color: .black.opacity(0.08), radius: 1.5, y: 1)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(view == .intrari ? "Intrări — după ziua plasării" : "Pregătiri — după ziua livrării")
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        .help(view == .intrari ? "Comenzile după ziua în care au fost plasate" : "Ce e de pregătit, după ziua livrării")
        .animation(.snappy(duration: 0.2), value: isOn)
    }
}

// MARK: - Delivery-method chips

/// Toate · one chip per Ridicare method · Livrare (every delivery method) ·
/// then one chip per delivery method when there are 2+, with active-order
/// counts. Exactly one selected; tapping it again goes back to Toate. A
/// trailing "Metode" button (admins) opens the method editor. Shown only while
/// the "Livrări din magazinul online" switch is on and the list loaded.
struct DeliveryMethodChipBar: View {
    let area: OrdersAreaState
    let canEditAliases: Bool
    let onEditAliases: () -> Void

    /// Long names ("Livrare în Cluj-Napoca") stay on one line.
    private static let maxLabelLength = 22

    var body: some View {
        let deliveries = area.deliveryMethods
        // Horizontal only: a vertical drag on the strip does nothing (no
        // bounce, never a pull-to-refresh).
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                HChip("Toate", isSelected: area.deliveryFilter == .all) {
                    area.deliveryFilter = .all
                }
                .help("Toate comenzile")
                ForEach(area.pickupMethods) { methodChip($0) }
                if !deliveries.isEmpty {
                    HChip("Livrare", count: area.deliveryCount,
                          isSelected: area.deliveryFilter == .kind(.DELIVERY)) {
                        area.toggle(.kind(.DELIVERY))
                    }
                    .accessibilityLabel("Livrare, \(area.deliveryCount) comenzi")
                    .help("Toate comenzile cu livrare")
                }
                if deliveries.count > 1 {
                    ForEach(deliveries) { methodChip($0) }
                }
                if canEditAliases {
                    Button(action: onEditAliases) {
                        Label("Metode", systemImage: "pencil")
                            .font(AppFont.body(13, weight: .semibold))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .contentShape(.interaction, Rectangle().inset(by: -6))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Metode de livrare: denumiri și tip")
                    .help("Denumiri scurte și tipul metodelor de livrare")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .animation(.snappy(duration: 0.2), value: area.methods)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .vertical)
        .scrollClipDisabled()
    }

    private func methodChip(_ method: DeliveryMethodInfo) -> some View {
        let filter = DeliveryFilter.method(method.name)
        return HChip(Self.short(method.label), count: method.count, isSelected: area.deliveryFilter == filter) {
            area.toggle(filter)
        }
        .accessibilityLabel("\(method.label), \(method.count) comenzi")
        .help(method.name)
    }

    private static func short(_ label: String) -> String {
        guard label.count > maxLabelLength else { return label }
        return String(label.prefix(maxLabelLength - 1)).trimmingCharacters(in: .whitespaces) + "…"
    }
}

// MARK: - Method editor (admins)

/// Every method: full imported name (small, muted), a short-name field
/// (placeholder = the default label) and a Ridicare | Livrare switch. Each
/// change saves on its own through `PUT /orders/delivery-methods/alias` —
/// the short name sends `{name, shortName}`, the kind `{name, kind}`.
struct DeliveryMethodAliasSheet: View {
    let area: OrdersAreaState
    @Environment(\.dismiss) private var dismiss
    @State private var drafts: [String: String] = [:]
    @State private var error: APIError?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(area.methods) { method in
                        row(method)
                    }
                } footer: {
                    Text("Denumirea scurtă apare pe filtre și pe comenzi; lasă gol pentru denumirea implicită. Tipul decide dacă metoda e o ridicare sau intră la „Livrare”.")
                }
            }
            .navigationTitle("Metode de livrare")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Gata") { dismiss() }
                }
            }
            .onAppear {
                for method in area.methods where drafts[method.name] == nil {
                    drafts[method.name] = method.shortName ?? ""
                }
            }
            .errorAlert($error)
        }
    }

    private func row(_ method: DeliveryMethodInfo) -> some View {
        let draft = Binding(
            get: { drafts[method.name] ?? method.shortName ?? "" },
            set: { drafts[method.name] = $0 })
        let saved = method.shortName ?? ""
        let isDirty = draft.wrappedValue.trimmingCharacters(in: .whitespaces) != saved
        let isSaving = area.isSavingAlias == method.name
        let kind = Binding(
            get: { method.kind },
            set: { newKind in if newKind != method.kind { saveKind(method.name, newKind) } })

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(method.name)
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .lineLimit(2)
                Spacer(minLength: 8)
                Text(RoCount.format(method.count, one: "comandă", many: "comenzi"))
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            HStack(spacing: 8) {
                TextField(method.defaultLabel, text: draft)
                    .font(AppFont.body(15))
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.done)
                    .onSubmit { if isDirty { save(method.name, draft.wrappedValue) } }
                Button {
                    save(method.name, draft.wrappedValue)
                } label: {
                    Group {
                        if isSaving {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "checkmark")
                                .font(.system(size: 15, weight: .bold))
                        }
                    }
                    .frame(width: 44, height: 36)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.Colors.primary)
                .disabled(!isDirty || isSaving)
                .accessibilityLabel("Salvează denumirea pentru \(method.name)")
            }
            HStack(spacing: 10) {
                Picker("Tip", selection: kind) {
                    ForEach(DeliveryKind.allCases) { Text($0.displayName).tag($0) }
                }
                .pickerStyle(.segmented)
                .disabled(isSaving)
                .accessibilityLabel("Tipul metodei \(method.name)")
                if method.kindSet {
                    Button("Auto") { saveKind(method.name, nil) }
                        .font(AppFont.body(13, weight: .semibold))
                        .buttonStyle(.borderless)
                        .disabled(isSaving)
                        .accessibilityLabel("Revino la tipul detectat automat")
                } else {
                    Text("auto")
                        .font(AppFont.body(12, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .accessibilityLabel("Tip detectat automat")
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func save(_ name: String, _ shortName: String) {
        run {
            try await area.saveAlias(name: name, shortName: shortName)
            let updated = area.methods.first { $0.name == name }?.shortName ?? ""
            drafts[name] = updated
            ToastCenter.shared.show(updated.isEmpty ? "Denumire implicită" : "Denumire salvată")
        }
    }

    private func saveKind(_ name: String, _ kind: DeliveryKind?) {
        run {
            try await area.saveKind(name: name, kind: kind)
            ToastCenter.shared.show(kind == nil ? "Tip detectat automat" : "Tip salvat: \(kind!.displayName)")
        }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        Task {
            do {
                try await work()
            } catch let err as APIError {
                error = err
            } catch {
                self.error = .networkError(error)
            }
        }
    }
}
