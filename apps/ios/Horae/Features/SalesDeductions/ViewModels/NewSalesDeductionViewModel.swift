import Foundation
import Observation

/// "Scădere nouă din vânzări": pas 1 locația, pas 2 sursa (Excel eBriza / manual / site).
@Observable
final class NewSalesDeductionViewModel {
    struct PickedFile: Equatable {
        let data: Data
        let name: String
        let mimeType: String
    }

    var locations: [LocationResponse] = []
    var locationId: String?
    var source: SalesDeductionSource = .EXCEL
    var file: PickedFile?
    var from = Calendar.current.startOfDay(for: Date())
    var to = Calendar.current.startOfDay(for: Date())
    var isBusy = false
    var error: APIError?
    /// The downloaded CSV template, written to a temp file for the share sheet.
    var templateURL: URL?

    private let service = SalesDeductionService.shared

    var selectedLocationName: String? {
        locations.first { $0.id == locationId }?.name
    }

    var canContinue: Bool {
        guard locationId != nil, !isBusy else { return false }
        switch source {
        case .EXCEL: return file != nil
        case .WOOCOMMERCE: return from <= to
        case .MANUAL: return true
        }
    }

    /// Downloads the CSV template (all sellable products, quantity blank) to a
    /// temp file so the sheet can hand it to Files / Mail / AirDrop.
    func downloadTemplate() async {
        guard let locationId else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            let data = try await service.fetchTemplateCsv(locationId: locationId)
            let date = ISO8601DateFormatter().string(from: Date()).prefix(10)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("scadere-stoc-\(date).csv")
            try data.write(to: url, options: .atomic)
            templateURL = url
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Active locations, shops first — that's where things usually sell.
    func loadLocations() async {
        guard locations.isEmpty else { return }
        do {
            // All org locations (web parity); users without that read fall back
            // to the locations they're assigned to.
            let all: [LocationResponse]
            if let everything = try? await LocationService.shared.fetchLocations(), !everything.isEmpty {
                all = everything
            } else {
                all = try await LocationService.shared.fetchMyLocations()
            }
            let active = all.filter(\.isActive)
            locations = active.filter { $0.type == .MAGAZIN } + active.filter { $0.type != .MAGAZIN }
            // Locatia implicita a organizatiei daca e setata si activa, altfel primul magazin.
            if locationId == nil {
                let configured = BrandingManager.shared.defaultLocationId.flatMap { id in locations.first { $0.id == id } }
                locationId = (configured ?? locations.first)?.id
            }
        } catch {
            self.error = .unknown("Nu am putut încărca locațiile")
        }
    }

    /// Reads the picked file (security-scoped) into memory.
    func pickFile(at url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            let ext = url.pathExtension.lowercased()
            let mime: String = switch ext {
            case "csv": "text/csv"
            case "xls": "application/vnd.ms-excel"
            default: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
            file = PickedFile(data: data, name: url.lastPathComponent, mimeType: mime)
        } catch {
            self.error = .unknown("Nu am putut citi fișierul")
        }
    }

    /// Creates the DRAFT from the chosen source.
    func create() async -> SalesDeduction? {
        guard canContinue, let locationId else { return nil }
        isBusy = true
        defer { isBusy = false }
        do {
            switch source {
            case .EXCEL:
                guard let file else { return nil }
                return try await service.createFromExcel(
                    fileData: file.data, fileName: file.name, mimeType: file.mimeType, locationId: locationId
                )
            case .WOOCOMMERCE:
                // Whole days, local time: [from 00:00:00, to 23:59:59].
                let cal = Calendar.current
                let start = cal.startOfDay(for: from)
                let endDay = cal.startOfDay(for: to)
                let end = cal.date(byAdding: DateComponents(day: 1, second: -1), to: endDay) ?? endDay
                return try await service.createFromWoo(locationId: locationId, from: start, to: end)
            case .MANUAL:
                return try await service.createManual(locationId: locationId)
            }
        } catch let err as APIError {
            error = err
            return nil
        } catch {
            self.error = .networkError(error)
            return nil
        }
    }
}
