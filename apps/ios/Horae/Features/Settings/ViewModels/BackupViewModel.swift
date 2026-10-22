import Foundation
import Observation

/// State pentru ecranul "Backup & Restaurare" (Setari → Administrare).
///
/// Restaurarea e dublu-gardata in UI (confirmare cu explicatie + cuvantul
/// `RESTAUREAZA` tastat manual) si, la succes, delogheaza fortat utilizatorul:
/// backendul revoca toate refresh token-urile organizatiei, deci sesiunea
/// curenta nu mai poate fi reinnoita.
@Observable
@MainActor
final class BackupViewModel {
    /// Cuvantul pe care utilizatorul trebuie sa il tasteze ca sa activeze restaurarea.
    static let confirmWord = "RESTAUREAZA"

    var snapshots: [OrgSnapshot] = []
    var isLoading = true
    var isCreating = false
    var isRestoring = false
    /// Id-ul snapshot-ului cu o actiune (download / stergere) in curs.
    var busySnapshotId: String?
    var error: APIError?

    /// Fisierul `.json.gz` descarcat — setat cand share sheet-ul trebuie deschis.
    var shareItem: ShareItem?

    /// Wrapper `Identifiable` peste URL-ul temporar, pentru `.sheet(item:)`.
    struct ShareItem: Identifiable, Hashable {
        let id = UUID()
        let url: URL
    }

    private let service = BackupService.shared
    private let log = AppLogger.shared

    var isBusy: Bool { isCreating || isRestoring || busySnapshotId != nil }

    // MARK: - Load

    func load() async {
        do {
            snapshots = try await service.fetchSnapshots()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
        isLoading = false
    }

    // MARK: - Create

    func createSnapshot(label: String) async {
        isCreating = true
        defer { isCreating = false }
        do {
            let created = try await service.createSnapshot(label: label)
            snapshots.insert(created, at: 0)
            ToastCenter.shared.show(
                "Starea a fost salvata",
                lines: [created.displaySize]
            )
            // Reincarcam ca sa avem exact ce a scris serverul (sumar, autor).
            await load()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    // MARK: - Restore

    /// Restaureaza organizatia din snapshot si afiseaza toastul de confirmare.
    /// - Returns: `true` la succes — apelantul trebuie sa inchida ecranul si sa
    ///   cheme `finishRestoreLogout()`.
    func restore(_ snapshot: OrgSnapshot) async -> Bool {
        isRestoring = true
        defer { isRestoring = false }
        do {
            let restored = try await service.restoreSnapshot(id: snapshot.id)
            let total = restored.values.reduce(0, +)
            let top = Array(SnapshotModelLabels.lines(from: restored).prefix(3))
            ToastCenter.shared.show(
                "Datele au fost restaurate (\(total) inregistrari)",
                lines: top + ["Vei fi deconectat…"]
            )
            log.log("Backup restore ok: snapshot=\(snapshot.id) rows=\(total)")
            return true
        } catch let err as APIError {
            error = err
            log.log("Backup restore failed: \(err)", level: .error)
            return false
        } catch {
            self.error = .networkError(error)
            return false
        }
    }

    /// Delogare fortata dupa o restaurare reusita: backendul a revocat toate
    /// refresh token-urile organizatiei, deci sesiunea curenta e moarta. Lasam
    /// toastul vizibil o clipa, apoi inchidem socketul si sesiunea locala.
    func finishRestoreLogout() async {
        try? await Task.sleep(for: .seconds(1.6))
        WebSocketManager.shared.disconnect()
        AuthManager.shared.logout()
    }

    // MARK: - Download

    /// Descarca `.json.gz` intr-un fisier temporar si deschide share sheet-ul.
    /// `403` = admin de organizatie care nu e si admin de platforma
    /// (`BACKUP_ADMIN_EMAILS`) — mesaj dedicat, nu "Permisiuni insuficiente".
    func download(_ snapshot: OrgSnapshot) async {
        busySnapshotId = snapshot.id
        defer { busySnapshotId = nil }
        shareItem = nil
        do {
            let data = try await service.downloadSnapshot(id: snapshot.id)
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(snapshot.downloadFileName)
            try data.write(to: url, options: .atomic)
            shareItem = ShareItem(url: url)
        } catch APIError.insufficientPermissions {
            error = .unknown("Doar administratorii platformei pot descărca fișierul de backup")
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    // MARK: - Delete

    func delete(_ snapshot: OrgSnapshot) async {
        guard !snapshot.auto else { return }
        busySnapshotId = snapshot.id
        defer { busySnapshotId = nil }
        do {
            try await service.deleteSnapshot(id: snapshot.id)
            snapshots.removeAll { $0.id == snapshot.id }
            ToastCenter.shared.show("Backup sters")
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
