import SwiftUI
import MapKit
import Observation

@Observable
final class LocationListViewModel {
    var locations: [LocationResponse] = []
    var isLoading = false
    var error: APIError?
    var isSavingDefault = false

    private let service = LocationService.shared

    /// Organization.defaultLocationId — preselectata la orice operatiune.
    var defaultLocationId: String? { BrandingManager.shared.defaultLocationId }

    /// Exactly one default: tapping the active one clears it, another moves it there.
    func toggleDefault(_ location: LocationResponse) async {
        let next = defaultLocationId == location.id ? nil : location.id
        isSavingDefault = true
        defer { isSavingDefault = false }
        do {
            try await BrandingManager.shared.setDefaultLocation(next)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            locations = try await service.fetchLocations()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

struct LocationListView: View {
    @State private var viewModel = LocationListViewModel()

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.locations.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.locations.isEmpty {
                ContentUnavailableView(
                    "Nicio locație",
                    systemImage: "building.2",
                    description: Text("Adaugă prima locație pentru a gestiona stocul")
                )
            } else {
                List(viewModel.locations) { location in
                    let isDefault = viewModel.defaultLocationId == location.id
                    NavigationLink(value: Route.locationEdit(id: location.id)) {
                        LocationRow(location: location, isDefault: isDefault)
                    }
                    .swipeActions(edge: .leading, allowsFullSwipe: false) {
                        if permissions.isAdmin {
                            Button {
                                Task { await viewModel.toggleDefault(location) }
                            } label: {
                                Label(isDefault ? "Nu mai e implicita" : "Implicita",
                                      systemImage: isDefault ? "star.slash" : "star")
                            }
                            .tint(isDefault ? .gray : .yellow)
                            .disabled(viewModel.isSavingDefault)
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Locații")
        .toolbar {
            if permissions.can(.create, .Location) {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink(value: Route.locationCreate) {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await Task { await viewModel.load() }.value }
        .errorAlert($viewModel.error)
    }
}

private struct LocationRow: View {
    let location: LocationResponse
    var isDefault = false
    @State private var coordinate: CLLocationCoordinate2D?

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            HStack(spacing: AppTheme.Spacing.md) {
                Image(systemName: location.type.icon)
                    .font(.title2)
                    .foregroundStyle(.tint)
                    .frame(width: 36)

                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text(location.name)
                        .font(.subheadline.weight(.semibold))

                    Text(location.address)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)

                    HStack(spacing: AppTheme.Spacing.sm) {
                        Text(location.type.displayName)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(.systemGray5))
                            .clipShape(Capsule())

                        if let phone = location.phone, !phone.isEmpty {
                            Label(phone, systemImage: "phone")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }

                        if !location.isActive {
                            Text("Inactiv")
                                .font(.caption2)
                                .foregroundStyle(.red)
                        }

                        if location.isMain && BrandingManager.shared.wooDeliveryEnabled {
                            // Vanzarile de pe site se scad din stocul ei.
                            Label("Principală", systemImage: "building.2.fill")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(AppTheme.Colors.primaryText)
                        }

                        if isDefault {
                            // Preselectata la orice operatiune (task, receptie, stoc, vanzari, transfer).
                            Label("Implicita", systemImage: "star.fill")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.tint)
                        }
                    }
                }
            }

            // Mini map preview
            if let coordinate {
                Map(initialPosition: .region(MKCoordinateRegion(
                    center: coordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.003, longitudeDelta: 0.003)
                ))) {
                    Marker(location.name, coordinate: coordinate)
                }
                .frame(height: 100)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.sm))
                .allowsHitTesting(false)
            }
        }
        .padding(.vertical, AppTheme.Spacing.xs)
        .task {
            let geocoder = CLGeocoder()
            if let placemarks = try? await geocoder.geocodeAddressString(location.address),
               let loc = placemarks.first?.location?.coordinate {
                coordinate = loc
            }
        }
    }
}

#Preview {
    NavigationStack {
        LocationListView()
    }
}
