import SwiftUI
import MapKit

@Observable
final class EditLocationViewModel {
    var name = ""
    var type: LocationType = .LABORATOR
    var address = ""
    var phone = ""
    var externalId = ""
    var isMainUnit = false
    var isSaving = false
    var isLoading = true
    var error: APIError?

    // Map
    var coordinate: CLLocationCoordinate2D?
    var isGeocoding = false

    private let locationId: String

    var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        !address.trimmingCharacters(in: .whitespaces).isEmpty
    }

    init(locationId: String) {
        self.locationId = locationId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let location = try await LocationService.shared.fetchLocation(id: locationId)
            name = location.name
            type = location.type
            address = location.address
            phone = location.phone ?? ""
            externalId = location.externalId ?? ""
            isMainUnit = location.isMain
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func geocodeAddress() async {
        let addr = address.trimmingCharacters(in: .whitespaces)
        guard !addr.isEmpty else {
            coordinate = nil
            return
        }

        isGeocoding = true
        defer { isGeocoding = false }

        let geocoder = CLGeocoder()
        do {
            let placemarks = try await geocoder.geocodeAddressString(addr)
            coordinate = placemarks.first?.location?.coordinate
        } catch {
            coordinate = nil
        }
    }

    var isDeleting = false

    /// One confirmation, one request: always force — the backend deletes the
    /// location together with everything on it (stock, transfers, assignments).
    func delete() async -> Bool {
        isDeleting = true
        defer { isDeleting = false }

        do {
            try await LocationService.shared.deleteLocation(id: locationId, force: true)
            return true
        } catch let err as APIError {
            error = err
            return false
        } catch {
            self.error = .networkError(error)
            return false
        }
    }

    /// Shop fields (external id, main unit) only exist while the
    /// "Livrări din magazinul online" switch is on.
    private var shopFields: Bool { BrandingManager.shared.wooDeliveryEnabled }

    func save() async -> Bool {
        isSaving = true
        defer { isSaving = false }

        do {
            let request = CreateLocationRequest(
                name: name.trimmingCharacters(in: .whitespaces),
                type: type,
                address: address.trimmingCharacters(in: .whitespaces),
                phone: phone.isEmpty ? nil : phone.trimmingCharacters(in: .whitespaces),
                // Hidden fields are left out, never cleared.
                externalId: shopFields ? externalId.trimmingCharacters(in: .whitespaces) : nil,
                isMainUnit: shopFields ? isMainUnit : nil
            )
            _ = try await LocationService.shared.updateLocation(id: locationId, request)
            return true
        } catch let err as APIError {
            error = err
            return false
        } catch {
            self.error = .networkError(error)
            return false
        }
    }
}

struct EditLocationView: View {
    let locationId: String

    @State private var viewModel: EditLocationViewModel
    @State private var showDeleteConfirmation = false
    @Environment(\.dismiss) private var dismiss

    init(locationId: String) {
        self.locationId = locationId
        self._viewModel = State(initialValue: EditLocationViewModel(locationId: locationId))
    }

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Form {
                    Section("Detalii") {
                        TextField("Nume locație *", text: $viewModel.name)

                        StockChipChoice(
                            options: LocationType.allCases.map { StockChoice(id: $0, title: $0.displayName) },
                            selection: $viewModel.type
                        )
                        .padding(.vertical, 4)

                        TextField("Adresa *", text: $viewModel.address)

                        TextField("Telefon", text: $viewModel.phone)
                            .keyboardType(.phonePad)
                    }

                    if BrandingManager.shared.wooDeliveryEnabled {
                        Section {
                            TextField("ID extern (WooCommerce)", text: $viewModel.externalId)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        } header: {
                            Text("Magazin online")
                        } footer: {
                            Text("ID-ul setat pe metoda de livrare în pluginul Pickupia. Comenzile de pe site cu acest ID devin ridicări de la această locație.")
                        }

                        Section {
                            Toggle("Unitate principală", isOn: $viewModel.isMainUnit)
                        } footer: {
                            Text("Vânzările de pe site se scad din stocul acestei locații (locația de ridicare dacă e unitate principală, altfel prima unitate principală).")
                        }
                    }

                    // Delete
                    Section {
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            HStack {
                                Spacer()
                                if viewModel.isDeleting {
                                    ProgressView()
                                } else {
                                    Label("Șterge locația", systemImage: "trash")
                                }
                                Spacer()
                            }
                        }
                        .disabled(viewModel.isDeleting)
                    }

                    // Map preview
                    if viewModel.isGeocoding {
                        Section("Localizare") {
                            HStack(spacing: AppTheme.Spacing.sm) {
                                ProgressView()
                                Text("Se caută adresa…")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else if let coordinate = viewModel.coordinate {
                        Section("Localizare") {
                            Map(initialPosition: .region(MKCoordinateRegion(
                                center: coordinate,
                                span: MKCoordinateSpan(latitudeDelta: 0.005, longitudeDelta: 0.005)
                            ))) {
                                Marker(viewModel.name.isEmpty ? "Locație" : viewModel.name, coordinate: coordinate)
                            }
                            .frame(height: 200)
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
                            .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                        }
                    }
                }
            }
        }
        .navigationTitle("Editează locația")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task {
                        if await viewModel.save() {
                            dismiss()
                        }
                    }
                } label: {
                    if viewModel.isSaving {
                        ProgressView()
                    } else {
                        Image(systemName: "checkmark")
                    }
                }
                .disabled(!viewModel.canSave || viewModel.isSaving)
            }
        }
        .task { await viewModel.load() }
        .task(id: viewModel.address) {
            try? await Task.sleep(for: .seconds(1.5))
            await viewModel.geocodeAddress()
        }
        .errorAlert($viewModel.error)
        .alert("Șterge locația?", isPresented: $showDeleteConfirmation) {
            Button("Anulează", role: .cancel) {}
            Button("Șterge tot", role: .destructive) {
                Task {
                    if await viewModel.delete() {
                        dismiss()
                    }
                }
            }
        } message: {
            Text("Se șterg permanent locația și tot ce ține de ea: stocurile, transferurile (stocul celor active se returnează la sursă) și asignările de utilizatori.")
        }
    }
}

#Preview {
    NavigationStack {
        EditLocationView(locationId: "preview-id")
    }
}
