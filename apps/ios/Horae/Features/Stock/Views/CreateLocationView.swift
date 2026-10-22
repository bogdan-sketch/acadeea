import SwiftUI
import MapKit

@Observable
final class CreateLocationViewModel {
    var name = ""
    var type: LocationType = .LABORATOR
    var address = ""
    var phone = ""
    var externalId = ""
    var isMainUnit = false
    var isSaving = false
    var error: APIError?

    // Map
    var coordinate: CLLocationCoordinate2D?
    var isGeocoding = false

    var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        !address.trimmingCharacters(in: .whitespaces).isEmpty
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

    /// Shop fields (external id, main unit) only exist while the
    /// "Livrări din magazinul online" switch is on.
    private var shopFields: Bool { BrandingManager.shared.wooDeliveryEnabled }

    func save() async -> LocationResponse? {
        isSaving = true
        defer { isSaving = false }

        do {
            let request = CreateLocationRequest(
                name: name.trimmingCharacters(in: .whitespaces),
                type: type,
                address: address.trimmingCharacters(in: .whitespaces),
                phone: phone.isEmpty ? nil : phone.trimmingCharacters(in: .whitespaces),
                externalId: !shopFields || externalId.trimmingCharacters(in: .whitespaces).isEmpty
                    ? nil : externalId.trimmingCharacters(in: .whitespaces),
                isMainUnit: shopFields && isMainUnit ? true : nil
            )
            return try await LocationService.shared.createLocation(request)
        } catch let err as APIError {
            error = err
            return nil
        } catch {
            self.error = .networkError(error)
            return nil
        }
    }
}

struct CreateLocationView: View {
    @State private var viewModel = CreateLocationViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                TextField("Nume locație *", text: $viewModel.name)

                StockChipChoice(
                    options: LocationType.allCases.map { StockChoice(id: $0, title: $0.displayName) },
                    selection: $viewModel.type
                )
                .padding(.vertical, 4)

                TextField("Adresa *", text: $viewModel.address)

                TextField("Telefon", text: $viewModel.phone)
                    .keyboardType(.phonePad)
            } header: {
                Text("Detalii").tutorialAnchor(id: "locations.manage.create")
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

            // Map preview — geocode after typing stops
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
        .navigationTitle("Locație nouă")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Image(systemName: "xmark") }
            }

            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task {
                        if await viewModel.save() != nil {
                            dismiss()
                        }
                    }
                } label: {
                    Image(systemName: "checkmark")
                }
                .disabled(!viewModel.canSave || viewModel.isSaving)
            }
        }
        .task(id: viewModel.address) {
            // Debounce geocoding — wait 1.5s after last keystroke
            try? await Task.sleep(for: .seconds(1.5))
            await viewModel.geocodeAddress()
        }
        .errorAlert($viewModel.error)
    }
}

#Preview {
    NavigationStack {
        CreateLocationView()
    }
}
