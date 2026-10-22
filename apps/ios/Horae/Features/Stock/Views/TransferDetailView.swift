import SwiftUI
import Observation

@Observable
final class TransferDetailViewModel {
    var transfer: TransferResponse?
    var isLoading = false
    var isUpdating = false
    var error: APIError?

    private let service = LocationService.shared

    func load(id: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            transfer = try await service.fetchTransfer(id: id)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func updateStatus(to newStatus: TransferStatus, assignedToId: String? = nil) async {
        guard let transfer else { return }
        isUpdating = true
        defer { isUpdating = false }

        do {
            self.transfer = try await service.updateTransferStatus(
                id: transfer.id,
                UpdateTransferStatusRequest(status: newStatus, assignedToId: assignedToId)
            )
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    var shareText: String {
        guard let t = transfer else { return "" }
        var lines: [String] = [
            "Foaie de parcurs - Transfer stoc",
            "================================",
            "",
            "De la: \(t.fromLocation.name)",
            "Adresa: \(t.fromLocation.address)",
            "",
            "Către: \(t.toLocation.name)",
            "Adresa: \(t.toLocation.address)",
            "",
            "Data: \(StockDate.fullTime(t.createdAt))",
            "Creat de: \(t.createdBy.fullName)",
            "Transport: \(t.assignedTo?.fullName ?? "neasignat")",
            "Status: \(t.status.displayName)",
            "",
            "Produse:",
            "----------",
        ]
        for item in t.items {
            lines.append("- \(item.rawMaterialTitle): \(item.unit.formatQty(item.quantity))")
        }
        return lines.joined(separator: "\n")
    }
}

struct TransferDetailView: View {
    let transferId: String
    @State private var viewModel = TransferDetailViewModel()
    @State private var showTransitPicker = false
    @State private var showPrintChoice = false
    @State private var isLoadingAviz = false
    @State private var avizError: APIError?

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let transfer = viewModel.transfer {
                transferContent(transfer)
            } else {
                // Never leave a blank screen: show why the load failed + let the
                // user retry, instead of an empty white page.
                ContentUnavailableView {
                    Label("Nu s-a putut încărca transferul", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(viewModel.error?.errorDescription ?? "A apărut o eroare. Încearcă din nou.")
                } actions: {
                    Button("Reîncearcă") {
                        Task { await viewModel.load(id: transferId) }
                    }
                }
            }
        }
        .navigationTitle("Detalii transfer")
        .toolbar {
            if let transfer = viewModel.transfer {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        Button { showPrintChoice = true } label: {
                            if isLoadingAviz {
                                ProgressView()
                            } else {
                                Image(systemName: "printer")
                            }
                        }
                        .accessibilityLabel("Tipărește documente")
                        .help("Foaie de parcurs, aviz de însoțire, declarație de conformitate")
                        .disabled(isLoadingAviz)
                        ShareLink(item: viewModel.shareText) {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                }

            }
        }
        .task { await viewModel.load(id: transferId) }
        .confirmationDialog("Tipărește", isPresented: $showPrintChoice, titleVisibility: .visible) {
            if let transfer = viewModel.transfer {
                            Button {
                                HTMLPrinter.present(
                                    html: Self.foaieDeParcursHTML(transfer),
                                    jobName: "Foaie de parcurs"
                                )
                            } label: {
                                Label("Foaie de parcurs", systemImage: "car")
                            }
                            Button {
                                Task {
                                    isLoadingAviz = true
                                    defer { isLoadingAviz = false }
                                    do {
                                        let aviz = try await LocationService.shared.fetchTransferAviz(id: transfer.id)
                                        HTMLPrinter.present(
                                            html: Self.avizHTML(aviz),
                                            jobName: "Aviz de însoțire a mărfii"
                                        )
                                    } catch let err as APIError {
                                        avizError = err
                                    } catch {
                                        avizError = .networkError(error)
                                    }
                                }
                            } label: {
                                Label("Aviz de însoțire a mărfii", systemImage: "doc.text")
                            }
                            Button {
                                Task {
                                    isLoadingAviz = true
                                    defer { isLoadingAviz = false }
                                    do {
                                        let conf = try await LocationService.shared.fetchTransferConformity(id: transfer.id)
                                        HTMLPrinter.present(
                                            html: Self.conformityHTML(conf),
                                            jobName: "Declarație de conformitate"
                                        )
                                    } catch let err as APIError {
                                        avizError = err
                                    } catch {
                                        avizError = .networkError(error)
                                    }
                                }
                            } label: {
                                Label("Declarație de conformitate", systemImage: "checkmark.seal")
                            }
            }
            Button("Anulează", role: .cancel) {}
        }
        .errorAlert($avizError)
        .refreshable { await Task { await viewModel.load(id: transferId) }.value }
        .errorAlert($viewModel.error)
        .sheet(isPresented: $showTransitPicker) {
            NavigationStack {
                UserPickerView(
                    currentId: viewModel.transfer?.assignedTo?.id ?? "",
                    onSelect: { id, _ in
                        showTransitPicker = false
                        Task { await viewModel.updateStatus(to: .IN_TRANZIT, assignedToId: id) }
                    },
                    onCancel: { showTransitPicker = false }
                )
            }
        }
    }

    private func transferContent(_ transfer: TransferResponse) -> some View {
        List {
            Section("Locații") {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    HStack {
                        Image(systemName: "arrow.up.right.circle.fill")
                            .foregroundStyle(.orange)
                        VStack(alignment: .leading) {
                            Text("De la")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(transfer.fromLocation.name)
                                .font(.subheadline.weight(.medium))
                            Text(transfer.fromLocation.address)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Divider()

                    HStack {
                        Image(systemName: "arrow.down.left.circle.fill")
                            .foregroundStyle(.green)
                        VStack(alignment: .leading) {
                            Text("Către")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            HStack(spacing: AppTheme.Spacing.xs) {
                                Text(transfer.toLocation.name)
                                    .font(.subheadline.weight(.medium))
                                if transfer.adhocDestination {
                                    Text("Eveniment")
                                        .font(.caption2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.purple.opacity(0.15))
                                        .foregroundStyle(.purple)
                                        .clipShape(Capsule())
                                }
                            }
                            if !transfer.toLocation.address.isEmpty {
                                Text(transfer.toLocation.address)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if let contact = transfer.destinationContact, !contact.isEmpty {
                                Text("Destinatar: \(contact)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section("Produse") {
                ForEach(transfer.items) { item in
                    HStack {
                        Text(item.rawMaterialTitle)
                            .font(.subheadline)
                        Spacer()
                        Text("\(item.unit.formatQty(item.quantity))")
                            .font(.subheadline.weight(.medium))
                    }
                }
            }

            Section("Informații") {
                LabeledContent("Status", value: transfer.status.displayName)
                LabeledContent("Creat de", value: transfer.createdBy.fullName)
                LabeledContent("Transport", value: transfer.assignedTo?.fullName ?? "Neasignat")
                LabeledContent("Data creare", value: StockDate.fullTime(transfer.createdAt))
                if let completedAt = transfer.completedAt {
                    LabeledContent("Finalizat", value: StockDate.fullTime(completedAt))
                }
                if let notes = transfer.notes, !notes.isEmpty {
                    LabeledContent("Note", value: notes)
                }
            }

            // Status actions live in the page body, matching the task detail.
            if transfer.status == .IN_ASTEPTARE || transfer.status == .IN_TRANZIT {
                Section("Acțiuni") {
                    if viewModel.isUpdating {
                        HStack {
                            ProgressView()
                            Text("Se actualizează…")
                                .foregroundStyle(.secondary)
                        }
                    }
                    if transfer.status == .IN_ASTEPTARE {
                        Button {
                            // A transfer can't teleport — needs a transporter.
                            if transfer.assignedTo == nil {
                                showTransitPicker = true
                            } else {
                                Task { await viewModel.updateStatus(to: .IN_TRANZIT) }
                            }
                        } label: {
                            HStack {
                                Image(systemName: "box.truck")
                                    .foregroundStyle(AppTheme.Colors.primary)
                                Text("Marchează în tranzit")
                                    .foregroundStyle(Color.primary)
                            }
                        }
                        .disabled(viewModel.isUpdating)
                        .tutorialAnchor(id: "stock.transfers.transit")
                    }
                    if transfer.status == .IN_TRANZIT {
                        Button {
                            Task { await viewModel.updateStatus(to: .FINALIZAT) }
                        } label: {
                            HStack {
                                Image(systemName: "checkmark.circle")
                                    .foregroundStyle(AppTheme.Colors.primary)
                                Text("Finalizează")
                                    .foregroundStyle(Color.primary)
                            }
                        }
                        .disabled(viewModel.isUpdating)
                        .tutorialAnchor(id: "stock.transfers.finalize")
                    }
                    Button {
                        Task { await viewModel.updateStatus(to: .ANULAT) }
                    } label: {
                        HStack {
                            Image(systemName: "xmark.circle")
                            Text("Anulează")
                        }
                        .foregroundStyle(Color.red)
                    }
                    .disabled(viewModel.isUpdating)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Foaie de parcurs (legal print form)

    /// Standard Romanian "foaie de parcurs" template: prefilled with what the
    /// system knows (unitate, dată, șofer, locații, act de însoțire, produse),
    /// everything else left blank for handwriting (nr. auto, ore, km, consum).
    static func foaieDeParcursHTML(_ t: TransferResponse) -> String {
        func esc(_ s: String) -> String {
            s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
        }
        let org = esc(BrandingManager.shared.organizationName)
        let date = t.createdAt.dottedDate
        let driver = esc(t.assignedTo?.fullName ?? "")
        let actNr = "TR-" + t.id.prefix(8)
        let obs = "\(t.items.count) produse"
        let emptyRows = String(
            repeating: "<tr>\(String(repeating: "<td>&nbsp;</td>", count: 7))</tr>",
            count: 14
        )
        let body = """
        <p class="meta">UNITATEA: <b>\(org)</b></p>
        <h1>FOAIE DE PARCURS</h1>
        <p class="meta">Tip autovehicul: Persoane <span class="sq"></span> &nbsp;&nbsp; Mărfuri <span class="sq"></span></p>
        <p class="meta">Tip combustibil: Benzină <span class="sq"></span> &nbsp;&nbsp; Motorină <span class="sq"></span></p>
        <table><tr>
          <td><b>Data:</b> \(date)</td>
          <td><b>Nr. auto:</b>&nbsp;</td>
          <td><b>Nume șofer:</b> \(driver)</td>
        </tr></table>
        <table>
          <tr><th colspan="2">Plecare</th><th colspan="2">Sosire</th><th rowspan="2">Km</th><th rowspan="2">Nr. act de însoțire</th><th rowspan="2">Observații</th></tr>
          <tr><th>Locul</th><th>Ora</th><th>Locul</th><th>Ora</th></tr>
          <tr><td>\(esc(t.fromLocation.name))</td><td>&nbsp;</td><td>\(esc(t.toLocation.name))</td><td>&nbsp;</td><td>&nbsp;</td><td>\(actNr)</td><td>\(obs)</td></tr>
          \(emptyRows)
        </table>
        <table><tr>
          <td><b>Consum specific:</b> <span class="box"></span> <span class="box"></span></td>
          <td><b>TOTAL KM:</b> <span class="box"></span></td>
          <td><b>Din care:</b> în oraș <span class="box"></span> &nbsp; în exterior <span class="box"></span></td>
        </tr></table>
        <p class="meta">Calculație ______________________ <span class="small">(Nr. de km x 10 &nbsp; consum specific x preț combustibil)</span></p>
        <div class="sig"><span>Calculat,</span><span>Șofer,</span></div>
        """
        return HTMLPrinter.document(title: "Foaie de parcurs", body: body)
    }

    /// Legal "aviz de însoțire a mărfii" (bon de transfer între gestiuni):
    /// serie+număr from the server (persisted, stable across reprints),
    /// furnizor/cumpărător with CUI, goods with prices where known, expedition
    /// block and receiving signature — blanks for hand-filled fields.
    static func avizHTML(_ a: TransferAvizResponse) -> String {
        func esc(_ s: String) -> String {
            s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
        }
        func money(_ v: Double?) -> String { v.map { String(format: "%.2f", $0) } ?? "&nbsp;" }
        func qty(_ v: Double) -> String { v.qtyFormatted }
        func party(_ label: String, _ p: TransferAvizResponse.Party) -> String {
            """
            <td style="width:50%"><b>\(label)</b><br>
            Denumire: \(esc(p.name))<br>
            Punct de lucru: \(esc(p.locationName))<br>
            Adresa: \(esc(p.address ?? "______________________"))<br>
            CUI: \(esc(p.cui ?? "______________"))</td>
            """
        }
        let issued = String(a.issuedAt.prefix(10)).split(separator: "-").reversed().joined(separator: ".")
        var totalKnown = 0.0
        var hasAnyPrice = false
        let rows = a.items.enumerated().map { i, item -> String in
            // Cantitatea se afiseaza umanizat (1000 g → 1 kg), deci pretul unitar
            // trebuie RESCALAT la aceeasi unitate ca sa iasa Cantitate × Preț =
            // Valoare pe documentul fiscal (identic cu avizul de pe web).
            let scaled = item.unit.documentScaled(item.quantity)
            let value: String
            let unitPriceDisplay: Double?
            if let price = item.unitPrice {
                hasAnyPrice = true
                let v = price * item.quantity
                totalKnown += v
                value = String(format: "%.2f", v)
                unitPriceDisplay = scaled.value != 0 ? v / scaled.value : price
            } else {
                value = "&nbsp;"
                unitPriceDisplay = nil
            }
            return """
            <tr><td>\(i + 1)</td><td>\(esc(item.name))</td><td>\(qty(scaled.value))</td>
            <td>\(scaled.unit.abbreviation)</td><td>\(money(unitPriceDisplay))</td><td>\(value)</td></tr>
            """
        }.joined()
        let body = """
        <h1>AVIZ DE ÎNSOȚIRE A MĂRFII</h1>
        <p class="meta" style="text-align:center">(bon de transfer între gestiuni)</p>
        <div class="row"><span class="meta"><b>Seria și nr.:</b> \(esc(a.serial))</span>
        <span class="meta"><b>Data emiterii:</b> \(issued)</span></div>
        <table><tr>\(party("FURNIZOR", a.supplier))\(party("CUMPĂRĂTOR", a.buyer))</tr></table>
        <table>
          <tr><th>Nr. crt</th><th>Denumirea bunurilor</th><th>Cantitate</th><th>U.M.</th><th>Preț unitar (lei)</th><th>Valoare (lei)</th></tr>
          \(rows)
          <tr><td colspan="5" style="text-align:right"><b>TOTAL</b></td><td>\(hasAnyPrice ? String(format: "%.2f", totalKnown) : "&nbsp;")</td></tr>
        </table>
        <p class="meta"><b>Date privind expediția:</b></p>
        <p class="meta">Numele delegatului: \(esc(a.delegateName ?? "______________________"))</p>
        <p class="meta">Destinatar (primește marfa): \(esc(a.recipientName ?? "______________________"))</p>
        <p class="meta">Seria și nr. CI/buletin: ______________________</p>
        <p class="meta">Mijloc de transport: ______________________ &nbsp;&nbsp; Ora efectuării expediției: __________</p>
        <div class="sig"><span>Data primirii în gestiune: ______________</span>
        <span>Semnătura gestionarului primitor: ______________</span></div>
        """
        return HTMLPrinter.document(title: "Aviz de insotire a marfii", body: body)
    }

    /// Declaratie de conformitate — faithful to the company's paper model:
    /// full legal letterhead, CB serial, standard declaration text
    /// (R852/2004/CE etc.), delivered goods and administrator signature.
    static func conformityHTML(_ c: TransferConformityResponse) -> String {
        func esc(_ s: String) -> String {
            s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
        }
        func qty(_ v: Double) -> String { v.qtyFormatted }
        let org = c.organization
        let issued = String(c.issuedAt.prefix(10)).split(separator: "-").reversed().joined(separator: ".")
        let deliveryFormatter = DateFormatter()
        deliveryFormatter.dateFormat = "dd.MM.yyyy"
        let delivery = deliveryFormatter.string(from: c.deliveryDate)
        var head = "<p class=\"meta\"><b>\(esc(org.name))</b></p>"
        if let a = org.legalAddress { head += "<p class=\"meta\">\(esc(a))</p>" }
        if let t = org.contactPhone { head += "<p class=\"meta\">Tel. \(esc(t))</p>" }
        if let e = org.contactEmail { head += "<p class=\"meta\">\(esc(e))</p>" }
        if let w = org.website { head += "<p class=\"meta\">\(esc(w))</p>" }
        if let cui = org.cui { head += "<p class=\"meta\">CUI: \(esc(cui))</p>" }
        if let r = org.regCom { head += "<p class=\"meta\">REG COM. \(esc(r))</p>" }
        let items = c.items
            .map { "<li>\(esc($0.name)) — \($0.unit.formatQty($0.quantity))</li>" }
            .joined()
        let body = """
        \(head)
        <h1 style="margin-top:24px">DECLARAȚIE DE CONFORMITATE</h1>
        <p class="meta" style="text-align:center">NR. \(esc(c.serial)) DIN DATA \(issued)</p>
        <p style="text-align:justify;line-height:1.6;margin-top:16px">
        Prin prezenta declarație de conformitate noi \(esc(org.name)), declarăm pe proprie răspundere
        că produsele livrate către <b>\(esc(c.deliveredTo))</b> în data de <b>\(delivery)</b>, nu pun
        în pericol viața, sănătatea, siguranța alimentară, securitatea muncii și protecția mediului
        și sunt în conformitate cu legislația sanitară, sanitar-veterinară și pentru siguranța
        alimentelor în vigoare, întrunind toate condițiile și normele legale de producere,
        comercializare și consum, cu respectarea R852/2004/CE, R853/2004/CE, R 2073/2005/CE și
        expiră după caz: 8 ore după livrare la maxim 20°C, respectiv 48 de ore la temperaturi de 4°C.
        </p>
        <p style="text-align:justify;line-height:1.6">
        Garantăm calitatea produselor pe timpul termenului de valabilitate cu condiția respectării
        condițiilor de depozitare. Nu ne asumăm nicio responsabilitate în cazul depozitării în
        condiții neconforme.
        </p>
        <p class="meta"><b>Produse livrate:</b></p>
        <ul>\(items)</ul>
        <div class="sig" style="margin-top:48px">
          <span><b>Administrator: \(esc(org.administratorName ?? "____________________"))</b></span>
          <span>Semnătura ____________________</span>
        </div>
        """
        return HTMLPrinter.document(title: "Declaratie de conformitate", body: body)
    }
}

#Preview {
    NavigationStack {
        TransferDetailView(transferId: "preview")
    }
}
