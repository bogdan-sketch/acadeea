import SwiftUI

struct SuppliersListView: View {
    @State private var suppliers: [Supplier] = []
    @State private var isLoading = false
    @State private var onlyLow = false
    @State private var error: APIError?
    @State private var showCreate = false
    @State private var editing: Supplier?

    private var canManage: Bool {
        AuthManager.shared.permissionManager.can(.manage, .RawMaterial)
    }

    var body: some View {
        List {
            Section {
                Toggle("Doar stoc scăzut", isOn: $onlyLow)
            }

            ForEach(filtered) { supplier in
                supplierSection(supplier)
            }
        }
        .overlay {
            if isLoading && suppliers.isEmpty {
                ProgressView()
            } else if !isLoading && suppliers.isEmpty {
                EmptyStateView(title: "Niciun furnizor", systemImage: "shippingbox")
            }
        }
        .navigationTitle("Furnizori")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage {
                ToolbarItem(placement: .primaryAction) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                }
            }
        }
        .task { await load() }
        .refreshable { await Task { await load() }.value }
        .errorAlert($error)
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                SupplierFormView(supplier: nil) { Task { await load() } }
            }
        }
        .sheet(item: $editing) { sup in
            NavigationStack {
                SupplierFormView(supplier: sup) { Task { await load() } }
            }
        }
    }

    private var filtered: [Supplier] {
        guard onlyLow else { return suppliers }
        return suppliers.filter { $0.lowStockCount > 0 }
    }

    @ViewBuilder
    private func supplierSection(_ s: Supplier) -> some View {
        let materials = onlyLow ? s.materials.filter(\.isLow) : s.materials
        Section {
            ForEach(materials) { m in
                HStack {
                    Text(m.title)
                    Spacer()
                    Text(m.unit.formatQty(m.stockCount))
                        .foregroundStyle(m.isLow ? .red : .secondary)
                        .font(.subheadline)
                }
            }
            if materials.isEmpty {
                Text("Fără produse").foregroundStyle(.secondary).font(.caption)
            }
        } header: {
            HStack {
                Text(s.name)
                if s.lowStockCount > 0 {
                    Text("\(s.lowStockCount) de comandat")
                        .font(.caption2)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(.red.opacity(0.15))
                        .foregroundStyle(.red)
                        .clipShape(Capsule())
                }
                Spacer()
                if canManage {
                    Button { editing = s } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "pencil")
                                .foregroundStyle(AppTheme.Colors.primary)
                            Text("Editează")
                                .foregroundStyle(Color.primary)
                        }
                    }
                    .font(.caption)
                }
            }
        }
    }

    private func format(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%.0f", v) : String(format: "%.2f", v)
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            suppliers = try await SupplierService.shared.fetchSuppliers()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

// MARK: - Supplier form

struct SupplierFormView: View {
    let supplier: Supplier?
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var contactPerson = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var notes = ""
    @State private var isSaving = false
    @State private var error: APIError?

    var body: some View {
        Form {
            Section("Furnizor") {
                TextField("Nume", text: $name)
                TextField("Persoana de contact", text: $contactPerson)
                TextField("Telefon", text: $phone).keyboardType(.phonePad)
                TextField("Email", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                TextField("Note", text: $notes, axis: .vertical).lineLimit(2...4)
            }
        }
        .navigationTitle(supplier == nil ? "Furnizor nou" : "Editează furnizor")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(supplier == nil ? "Adaugă" : "Salvează") {
                    Task { await save() }
                }
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
            }
            ToolbarItem(placement: .cancellationAction) {
                Button("Anulează") { dismiss() }
            }
        }
        .onAppear {
            if let s = supplier {
                name = s.name
                contactPerson = s.contactPerson ?? ""
                phone = s.phone ?? ""
                email = s.email ?? ""
                notes = s.notes ?? ""
            }
        }
        .errorAlert($error)
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let body = CreateSupplierRequest(
            name: name.trimmingCharacters(in: .whitespaces),
            contactPerson: contactPerson.isEmpty ? nil : contactPerson,
            phone: phone.isEmpty ? nil : phone,
            email: email.isEmpty ? nil : email,
            notes: notes.isEmpty ? nil : notes
        )
        do {
            if let s = supplier {
                _ = try await SupplierService.shared.updateSupplier(id: s.id, body)
            } else {
                _ = try await SupplierService.shared.createSupplier(body)
            }
            onSave()
            dismiss()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
