import SwiftUI

/// Profil › Setări — the organisation (web `setari-tab.tsx`): one column of
/// summary cards, each with ONE worded action into its full screen, and a
/// chip strip on top that jumps to a section. Backup and Zonă periculoasă
/// are root-only (`manage all`), as on the web. No Jurnal sistem card: iOS
/// has no system-log screen.
struct ProfileSettingsTab: View {
    var scrollTo: (String) -> Void = { _ in }

    @State private var model = ProfileSettingsModel()
    private var isRoot: Bool { AuthManager.shared.permissionManager.isAdmin }

    private var anchors: [(id: String, label: String)] {
        var list: [(String, String)] = [
            ("companie", "Companie"), ("locatii", "Locații"), ("categorii", "Categorii"), ("stoc", "Stoc"),
            ("identitate", "Identitate"), ("echipa", "Echipă & roluri"), ("comenzi-site", "Comenzi din site"),
        ]
        if isRoot { list.append(("backup", "Backup & restaurare")) }
        list.append(("noutati", "Noutăți"))
        if isRoot { list.append(("zona-periculoasa", "Zonă periculoasă")) }
        return list.map { (id: $0.0, label: $0.1) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            anchorStrip
            CompanySection(org: model.org).id("companie")
            LocationsSection(model: model).id("locatii")
            CategoriesSection().id("categorii")
            StockToolsSection().id("stoc")
            OrgLogoCard().id("identitate")
            TeamSection(model: model).id("echipa")
            ShopSection(model: model).id("comenzi-site")
            if isRoot { BackupSection(model: model).id("backup") }
            ReleaseSection(model: model).id("noutati")
            if isRoot { DangerSection().id("zona-periculoasa") }
        }
        .task { await model.load(isRoot: isRoot) }
        .errorAlert($model.error)
    }

    private var anchorStrip: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(anchors, id: \.id) { anchor in
                    Button { scrollTo(anchor.id) } label: {
                        Text(anchor.label)
                            .font(AppFont.body(13, weight: .semibold))
                            .foregroundStyle(anchor.id == "zona-periculoasa"
                                ? AppTheme.Status.fg(.danger) : AppTheme.Colors.label)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 44)
                            .background(AppTheme.Colors.card, in: Capsule())
                            .overlay(Capsule().strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Sari la secțiune")
                }
            }
            .padding(.horizontal, 1)
        }
        .scrollIndicators(.hidden)
    }
}

// MARK: - Companie

private struct CompanySection: View {
    let org: OrganizationDetails?

    private var rows: [(String, String)] {
        func v(_ s: String?) -> String { (s?.trimmingCharacters(in: .whitespaces).isEmpty ?? true) ? "—" : s! }
        let cuiReg = [org?.cui, org?.regCom].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        let contact = [org?.contactEmail, org?.contactPhone].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        let tva: String = {
            guard let org else { return "—" }
            if org.vatPayer ?? false {
                return "Plătitor · cota \(Int((org.vatRatePercent ?? 21).rounded()))%"
            }
            return "Neplătitor de TVA"
        }()
        return [("Firmă", v(org?.name)), ("CUI · Reg. Com.", v(cuiReg)), ("TVA", tva),
                ("Sediu (pe documente)", v(org?.legalAddress)), ("Contact (pe documente)", v(contact)),
                ("Administrator", v(org?.administratorName))]
    }

    var body: some View {
        ProfileSection("Companie", description: "Datele firmei tipărite pe avize, etichete și declarații.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), alignment: .topLeading)],
                      alignment: .leading, spacing: 14) {
                ForEach(rows, id: \.0) { key, value in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(key).font(AppFont.body(12, weight: .semibold))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        Text(value).font(AppFont.body(14))
                            .foregroundStyle(AppTheme.Colors.label)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 14)
        } footer: {
            ProfileSectionFooter(note: "Nume, CUI, sediu, contact și regimul de TVA") {
                ProfileWordLink(title: "Editează", systemImage: "pencil", route: .companyEdit,
                                help: "Editează datele firmei")
            }
        }
    }
}

// MARK: - Locații

private struct LocationsSection: View {
    let model: ProfileSettingsModel

    var body: some View {
        ProfileSection("Locații",
                       description: "Locația implicită e preselectată la stoc nou, transfer, vânzări și comenzi de pe site.") {
            if model.locationsLoaded && model.locations.isEmpty {
                ProfileRow("Nicio locație încă") { EmptyView() }
            }
            ForEach(model.locations) { location in
                let isDefault = model.org?.defaultLocationId == location.id
                let isMain = location.isMain && BrandingManager.shared.wooDeliveryEnabled
                ProfileRow(location.name,
                           subtitle: [isMain ? "Principală" : "", location.type.displayName, location.address]
                               .filter { !$0.isEmpty }.joined(separator: " · ")) {
                    defaultPill(location, isDefault: isDefault)
                    NavigationLink(value: Route.locationEdit(id: location.id)) {
                        Image(systemName: "pencil")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(AppTheme.Colors.label)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Editează locația \(location.name)")
                    .help("Editează locația: nume, adresă, tip")
                }
            }
        } footer: {
            ProfileSectionFooter(note: RoCount.format(model.locations.count, one: "locație", many: "locații")) {
                ProfileWordLink(title: "Locație nouă", systemImage: "plus", route: .locationCreate,
                                help: "Adaugă un depozit, laborator sau punct de vânzare")
            }
        }
    }

    private func defaultPill(_ location: LocationResponse, isDefault: Bool) -> some View {
        Button {
            guard !isDefault else { return }
            Task { await model.makeDefault(location) }
        } label: {
            Group {
                if model.settingDefault == location.id {
                    ProgressView().controlSize(.small)
                } else {
                    Text(isDefault ? "Implicită" : "Fă implicită")
                }
            }
            .font(AppFont.body(13, weight: .bold))
            .foregroundStyle(isDefault ? AppTheme.Colors.onPrimary : AppTheme.Colors.label)
            .padding(.horizontal, 12)
            .frame(minHeight: 34)
            .background(isDefault ? AppTheme.Colors.primary : AppTheme.Colors.appBackground, in: Capsule())
            .overlay(Capsule().strokeBorder(isDefault ? .clear : AppTheme.Colors.border, lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isDefault ? "\(location.name) e locația implicită" : "Fă \(location.name) locația implicită")
        .accessibilityAddTraits(isDefault ? .isSelected : [])
    }
}

// MARK: - Categorii

private struct CategoriesSection: View {
    var body: some View {
        ProfileSection("Categorii", description: "Ordinea de aici e ordinea din Stoc și Rețete, pe web și pe iPhone.") {
            ProfileRow("Materii prime · Semipreparate · Produse finite",
                       subtitle: "Adaugă, redenumește și ordonează categoriile") {
                ProfileWordLink(title: "Gestionează", systemImage: "list.number", route: .categoryManagement,
                                help: "Gestionează categoriile")
            }
        }
    }
}

// MARK: - Stoc (Revizie, Vânzări → stoc)

/// The two stock tools that left the Stoc strip (web parity): reachable here
/// the web way, as summary rows.
private struct StockToolsSection: View {
    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    var body: some View {
        ProfileSection("Stoc", description: "Revizia stocurilor și vânzările din magazin scăzute din stoc.") {
            if permissions.isAdmin {
                ProfileRow("Revizie stocuri", subtitle: "Excel cu tot stocul pe loturi, pentru inventar") {
                    ProfileWordLink(title: "Deschide", systemImage: "checklist", route: .stockReview,
                                    help: "Revizie stocuri")
                }
            }
            if SalesDeductionFeature.shared.isAvailable(permissions) {
                ProfileRow("Vânzări → stoc", subtitle: "Rapoartele de vânzări încărcate scad produsele din stoc") {
                    ProfileWordLink(title: "Deschide", systemImage: "receipt", route: .salesDeductions,
                                    help: "Vânzări → stoc")
                }
            }
        }
    }
}

// MARK: - Echipă & roluri

private struct TeamSection: View {
    let model: ProfileSettingsModel

    private var title: String {
        guard let people = model.peopleCount else { return "Echipa" }
        var parts = [RoCount.format(people, one: "persoană", many: "persoane")]
        if let roles = model.rolesCount { parts.append(RoCount.format(roles, one: "rol", many: "roluri")) }
        return parts.joined(separator: " · ")
    }

    private var subtitle: String? {
        switch model.pendingInvites {
        case 0: nil
        case 1: "o invitație în așteptare"
        default: "\(model.pendingInvites) invitații în așteptare"
        }
    }

    var body: some View {
        ProfileSection("Echipă & roluri", description: "Persoane, invitații și drepturile fiecărui rol.") {
            ProfileRow(title, subtitle: subtitle) {
                ProfileWordLink(title: "Deschide echipa", systemImage: "person.2", route: .userList,
                                help: "Persoane, invitații și drepturi pe rol")
            }
            ProfileRow("Roluri și permisiuni", subtitle: "Ce poate vedea și face fiecare rol") {
                ProfileWordLink(title: "Roluri", systemImage: "lock.shield", route: .roleList,
                                help: "Roluri și permisiuni")
            }
        }
    }
}

// MARK: - Comenzi din site

private struct ShopSection: View {
    let model: ProfileSettingsModel

    private var canManageOrg: Bool { AuthManager.shared.permissionManager.can(.manage, .Organization) }

    var body: some View {
        ProfileSection("Comenzi din site",
                       description: "De unde vin comenzile online. Vânzările din magazin se încarcă din Vânzări → stoc.") {
            if canManageOrg {
                ProfileRow("Livrări din magazinul online",
                           subtitle: "Preia data și metoda de livrare din WooCommerce (pluginul Pickupia), ID extern și unitate principală la locații, filtre pe metoda de livrare la comenzi.") {
                    if model.savingWooDelivery {
                        ProgressView().controlSize(.small)
                    }
                    Toggle("Livrări din magazinul online", isOn: Binding(
                        get: { BrandingManager.shared.wooDeliveryEnabled },
                        set: { value in Task { await model.setWooDelivery(value) } }))
                        .labelsHidden()
                        .disabled(model.savingWooDelivery)
                }
            }
            if let shop = model.shop {
                ProfileRow(title: shop.providerDisplayName, subtitle: subtitle(shop)) {
                    Circle().fill(dot(shop.status)).frame(width: 10, height: 10).accessibilityHidden(true)
                } trailing: {
                    ProfileWordLink(title: "Configurează", systemImage: "gearshape", route: .integrationList,
                                    help: "Chei, sincronizare, mapare produse")
                }
            } else {
                ProfileRow(title: "Nicio conexiune",
                           subtitle: model.integrations == nil ? nil : "Comenzile se adaugă manual până conectezi magazinul") {
                    Circle().fill(AppTheme.Colors.border).frame(width: 10, height: 10).accessibilityHidden(true)
                } trailing: {
                    ProfileWordLink(title: "Conectează", systemImage: "powerplug", route: .integrationList,
                                    help: "Conectează WooCommerce")
                }
            }
        }
    }

    private func subtitle(_ shop: Integration) -> String {
        let state = switch shop.status {
        case "ACTIVE": "Conectat"
        case "ERROR": "Eroare"
        default: "Inactiv"
        }
        let sync = shop.lastSyncAt.flatMap(ISO8601.parse).map { "ultima sincronizare \(ProfileDates.when($0))" }
            ?? "nicio sincronizare încă"
        let mapped = RoCount.format(shop.mappingsCount, one: "produs legat", many: "produse legate") + " de rețete"
        return [state, sync, mapped].joined(separator: " · ")
    }

    private func dot(_ status: String) -> Color {
        switch status {
        case "ACTIVE": AppTheme.Status.fg(.ready)
        case "ERROR": AppTheme.Status.fg(.danger)
        default: AppTheme.Colors.border
        }
    }
}

// MARK: - Backup & restaurare (root)

private struct BackupSection: View {
    let model: ProfileSettingsModel

    var body: some View {
        ProfileSection("Backup & restaurare", description: "Salvare automată în fiecare noapte; poți salva și restaura oricând.",
                       tag: "doar root") {
            ProfileRow(title, subtitle: subtitle) {
                ProfileWordButton(title: "Backup acum", systemImage: "externaldrive.badge.plus",
                                  isBusy: model.isBackingUp, help: "Salvează starea curentă a datelor") {
                    Task { await model.backupNow() }
                }
                ProfileWordLink(title: "Salvările", systemImage: "clock.arrow.circlepath", route: .backupSettings,
                                help: "Vezi și restaurează salvările")
            }
        }
    }

    private var title: String {
        guard let snapshots = model.snapshots else { return "Backup" }
        guard let last = snapshots.first else { return "Niciun backup încă" }
        return "Ultimul backup: \(ProfileDates.when(last.createdAt)) · \(last.auto ? "automat" : "manual")"
    }

    private var subtitle: String? {
        guard let count = model.snapshots?.count, count > 0 else { return nil }
        return RoCount.format(count, one: "salvare păstrată", many: "salvări păstrate")
    }
}

// MARK: - Noutăți

private struct ReleaseSection: View {
    let model: ProfileSettingsModel

    var body: some View {
        ProfileSection("Noutăți", description: "Ce s-a schimbat în fiecare versiune.") {
            ProfileRow(title, subtitle: model.release?.title) {
                ProfileWordLink(title: "Toate", systemImage: "sparkles", route: .changelog,
                                help: "Toate noutățile")
            }
        }
    }

    private var title: String {
        guard let release = model.release else { return AppConfig.brandName }
        let version = model.currentVersion ?? release.version
        let day = RoDate.date(fromISODay: release.date).map { "\(RoDate.dayMonth($0)) \(Calendar.current.component(.year, from: $0))" }
        return ["\(AppConfig.brandName) \(version)", day].compactMap { $0 }.joined(separator: " din ")
    }
}

// MARK: - Zonă periculoasă (root)

private struct DangerSection: View {
    var body: some View {
        ProfileSection("Zonă periculoasă", description: "Resetare date: alegi exact ce se șterge.",
                       tag: "doar root", tone: .danger) {
            ProfileRow("Resetare date", subtitle: "Șterge datele organizației, pe categorii",
                       titleColor: AppTheme.Status.fg(.danger)) {
                ProfileWordLink(title: "Resetează…", systemImage: "eraser", route: .dataReset,
                                help: "Alege ce date se șterg")
            }
        }
    }
}

// MARK: - Dates

/// "azi, 09:30" / "3 sept. 2026, 09:30" — day first, 24h (web `when()`).
enum ProfileDates {
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = RoDate.locale
        f.calendar = RoDate.calendar
        f.dateFormat = "d MMM yyyy"
        return f
    }()

    static func when(_ date: Date) -> String {
        if RoDate.calendar.isDateInToday(date) { return "azi, \(RoDate.time(date))" }
        return "\(dayFormatter.string(from: date)), \(RoDate.time(date))"
    }
}

/// ISO-8601 strings from the API, with or without fractional seconds.
enum ISO8601 {
    private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    static func parse(_ string: String) -> Date? {
        fractional.date(from: string) ?? plain.date(from: string)
    }
}

#Preview("Profil › Setări") {
    NavigationStack {
        ScrollView { ProfileSettingsTab().padding() }
            .background(AppTheme.Colors.appBackground)
    }
}
