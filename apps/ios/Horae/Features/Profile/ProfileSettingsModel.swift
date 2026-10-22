import Foundation
import Observation

/// Loads the summaries of Profil › Setări (one card per section, web
/// `setari-tab.tsx`). Every call is best-effort: a failing one leaves its
/// card on a neutral state instead of failing the page.
@Observable
@MainActor
final class ProfileSettingsModel {
    var org: OrganizationDetails?
    var locations: [LocationResponse] = []
    var locationsLoaded = false
    var peopleCount: Int?
    var rolesCount: Int?
    var pendingInvites = 0
    var integrations: [Integration]?
    var snapshots: [OrgSnapshot]?
    var release: ChangelogEntry?
    var currentVersion: String?
    var settingDefault: String?
    var isBackingUp = false
    var savingWooDelivery = false
    var error: APIError?

    /// WooCommerce first (the "Comenzi din site" row), else any connection.
    var shop: Integration? {
        integrations?.first { $0.provider.uppercased() == "WOOCOMMERCE" } ?? integrations?.first
    }

    func load(isRoot: Bool) async {
        async let org = try? ProfileService.shared.fetchOrganization()
        async let locations = try? LocationService.shared.fetchLocations()
        async let people = try? UserService.shared.fetchUsers(query: UserQuery(limit: 1))
        async let roles = try? RoleService.shared.fetchRoles()
        async let invites = try? UserService.shared.fetchInvitations()
        async let integrations = try? IntegrationService.shared.fetchAll()
        async let changelog = try? ChangelogService.shared.fetchChangelog()

        self.org = await org
        self.locations = await locations ?? []
        locationsLoaded = true
        peopleCount = await people?.total
        rolesCount = await roles?.count
        let now = Date()
        pendingInvites = (await invites ?? []).filter { $0.acceptedAt == nil && $0.expiresAt > now }.count
        self.integrations = await integrations ?? []
        if let log = await changelog {
            release = log.entries.first
            currentVersion = log.currentVersion
        }
        if isRoot {
            let list = (try? await BackupService.shared.fetchSnapshots()) ?? []
            snapshots = list.sorted { $0.createdAt > $1.createdAt }
        }
    }

    func makeDefault(_ location: LocationResponse) async {
        settingDefault = location.id
        defer { settingDefault = nil }
        do {
            try await BrandingManager.shared.setDefaultLocation(location.id)
            org = try? await ProfileService.shared.fetchOrganization()
            ToastCenter.shared.show("\(location.name) e acum locația implicită")
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Admin: the "Livrări din magazinul online" feature switch.
    func setWooDelivery(_ enabled: Bool) async {
        savingWooDelivery = true
        defer { savingWooDelivery = false }
        do {
            try await BrandingManager.shared.setWooDeliveryEnabled(enabled)
            if BrandingManager.shared.wooDeliveryEnabled != enabled {
                // Older API: the field isn't stored yet.
                error = .unknown("Serverul nu suportă încă această setare.")
                return
            }
            await OrdersAreaState.shared.loadMethods()
            ToastCenter.shared.show(enabled ? "Livrările din magazin sunt active" : "Livrările din magazin sunt oprite")
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func backupNow() async {
        isBackingUp = true
        defer { isBackingUp = false }
        do {
            let snapshot = try await BackupService.shared.createSnapshot(label: nil)
            snapshots = [snapshot] + (snapshots ?? [])
            ToastCenter.shared.show("Starea a fost salvată")
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
