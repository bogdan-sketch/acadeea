import SwiftUI

/// Profil › Setări › Companie › Editează — the company data printed on
/// avize, labels and declarations (`PATCH /organization`, web
/// `/settings/company`).
struct CompanyEditView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var form = UpdateCompanyRequest(
        name: "", cui: "", regCom: "", legalAddress: "", contactPhone: "",
        contactEmail: "", website: "", administratorName: "", vatPayer: false, vatRatePercent: 21)
    @State private var original: UpdateCompanyRequest?
    @State private var isSaving = false
    @State private var error: APIError?
    @State private var saved = 0

    /// Romanian VAT rates in force (standard, reduced) — chips, not a menu.
    private let vatRates: [Double] = [21, 11]

    private var dirty: Bool {
        guard let original else { return false }
        return original.name != form.name || original.cui != form.cui || original.regCom != form.regCom
            || original.legalAddress != form.legalAddress || original.contactPhone != form.contactPhone
            || original.contactEmail != form.contactEmail || original.website != form.website
            || original.administratorName != form.administratorName || original.vatPayer != form.vatPayer
            || original.vatRatePercent != form.vatRatePercent
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ProfileSection("Firmă și documente", description: "Apar pe avize, etichete și declarații de conformitate.") {
                    VStack(alignment: .leading, spacing: 14) {
                        field("Nume organizație", $form.name, content: .organizationName)
                        field("CUI", $form.cui)
                        field("Nr. Reg. Com.", $form.regCom)
                        field("Adresă sediu (documente)", $form.legalAddress, content: .fullStreetAddress)
                        field("Telefon (documente)", $form.contactPhone, content: .telephoneNumber, keyboard: .phonePad)
                        field("Email (documente)", $form.contactEmail, content: .emailAddress, keyboard: .emailAddress)
                        field("Website", $form.website, content: .URL, keyboard: .URL)
                        field("Administrator (semnează declarațiile)", $form.administratorName, content: .name)
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
                vatSection
            }
            .padding(16)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
            .disabled(original == nil || isSaving)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(AppTheme.Colors.appBackground.ignoresSafeArea())
        .navigationTitle("Companie")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Salvează") { Task { await save() } }
                    .disabled(!dirty || isSaving || form.name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .overlay { if original == nil { ProgressView() } }
        .task { await load() }
        .sensoryFeedback(.success, trigger: saved)
        .errorAlert($error)
    }

    private var vatSection: some View {
        ProfileSection("TVA", description: "Prețurile de achiziție se rețin fără TVA pentru plătitori, cu TVA pentru neplătitori.") {
            ProfileRow("Plătitor de TVA") {
                Toggle("Plătitor de TVA", isOn: $form.vatPayer)
                    .labelsHidden()
                    .tint(AppTheme.Colors.primary)
            }
            if form.vatPayer {
                ProfileRow("Cota TVA") {
                    ForEach(vatRates, id: \.self) { rate in
                        let isOn = form.vatRatePercent == rate
                        Button { form.vatRatePercent = rate } label: {
                            Text("\(Int(rate)) %")
                                .font(AppFont.body(14, weight: .bold))
                                .foregroundStyle(isOn ? AppTheme.Colors.onPrimary : AppTheme.Colors.label)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 44)
                                .background(isOn ? AppTheme.Colors.primary : AppTheme.Colors.appBackground, in: Capsule())
                                .overlay(Capsule().strokeBorder(isOn ? .clear : AppTheme.Colors.border, lineWidth: 1))
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Cota \(Int(rate)) la sută")
                        .accessibilityAddTraits(isOn ? .isSelected : [])
                    }
                }
                .sensoryFeedback(.selection, trigger: form.vatRatePercent)
            }
        }
    }

    private func field(
        _ label: String, _ text: Binding<String>,
        content: UITextContentType? = nil, keyboard: UIKeyboardType = .default
    ) -> some View {
        ProfileField(label: label) {
            TextField("", text: text)
                .textContentType(content)
                .keyboardType(keyboard)
                .autocorrectionDisabled()
                .textInputAutocapitalization(keyboard == .default ? .sentences : .never)
                .profileBox()
        }
    }

    @MainActor
    private func load() async {
        do {
            let org = try await ProfileService.shared.fetchOrganization()
            let value = UpdateCompanyRequest(
                name: org.name, cui: org.cui ?? "", regCom: org.regCom ?? "",
                legalAddress: org.legalAddress ?? "", contactPhone: org.contactPhone ?? "",
                contactEmail: org.contactEmail ?? "", website: org.website ?? "",
                administratorName: org.administratorName ?? "", vatPayer: org.vatPayer ?? false,
                vatRatePercent: org.vatRatePercent ?? 21)
            form = value
            original = value
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    @MainActor
    private func save() async {
        isSaving = true
        defer { isSaving = false }
        var body = form
        body.name = body.name.trimmingCharacters(in: .whitespaces)
        do {
            _ = try await ProfileService.shared.updateCompany(body)
            original = body
            saved += 1
            ToastCenter.shared.show("Datele firmei au fost salvate")
            dismiss()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

#Preview {
    NavigationStack {
        CompanyEditView()
    }
}
