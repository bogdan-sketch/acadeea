import SwiftUI

struct TaskTraceabilityView: View {
    let taskId: String
    @State private var sheet: TaskTraceability?
    @State private var isLoading = false
    @State private var error: APIError?

    var body: some View {
        Group {
            if let sheet {
                content(sheet)
            } else if isLoading {
                ProgressView()
            } else {
                EmptyStateView(title: "Indisponibil", systemImage: "doc.text.magnifyingglass")
            }
        }
        .navigationTitle("Fișă de trasabilitate")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let sheet {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        Button {
                            HTMLPrinter.present(html: printHTML(sheet), jobName: "Fișă de trasabilitate")
                        } label: {
                            Image(systemName: "printer")
                        }
                        ShareLink(item: shareText(sheet)) {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                }
            }
        }
        .task { await load() }
        .errorAlert($error)
    }

    // MARK: - Print

    private func printHTML(_ s: TaskTraceability) -> String {
        func esc(_ t: String) -> String {
            t.replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;")
        }
        func lotRows(_ ing: TraceabilityIngredient) -> String {
            let dateFmt: (Date?) -> String = { $0?.dottedDate ?? "—" }
            if ing.lots.isEmpty {
                return """
                <tr><td>\(esc(ing.title))</td><td>\(ing.unit.formatQty(ing.quantity))</td>
                <td>\(esc(ing.lotNumber ?? "—"))</td><td>\(esc(ing.invoiceNumber ?? "—"))</td>
                <td>\(esc(ing.supplier ?? "—"))</td><td>\(dateFmt(ing.expiryDate))</td></tr>
                """
            }
            return ing.lots.map { lot in
                """
                <tr><td>\(esc(ing.title))</td><td>\(ing.unit.formatQty(lot.quantity))</td>
                <td>\(esc(lot.lotNumber ?? "—"))</td><td>\(esc(lot.invoiceNumber ?? "—"))</td>
                <td>\(esc(lot.supplier ?? "—"))</td><td>\(dateFmt(lot.expiryDate))</td></tr>
                """
            }.joined()
        }
        let tableHead = "<tr><th>Ingredient</th><th>Cantitate</th><th>Lot</th><th>Factură</th><th>Furnizor</th><th>Expirare</th></tr>"
        var body = """
        <h1>FIȘĂ DE TRASABILITATE</h1>
        <p class="meta"><b>Produs:</b> \(esc(s.recipeName)) (\(s.recipeType.displayName))</p>
        <p class="meta"><b>Cantitate:</b> \(s.targetUnit.formatQty(s.actualYield ?? s.targetQuantity))</p>
        <p class="meta"><b>Executat de:</b> \(esc(s.assignedToName ?? s.createdByName))</p>
        """
        if let c = s.completedAt {
            body += "<p class=\"meta\"><b>Finalizat:</b> \(RoDate.shortDateTime(c))</p>"
        }
        body += "<h1 style=\"text-align:left;font-size:13px;margin-top:16px\">Ingrediente consumate</h1>"
        body += "<table>\(tableHead)\(s.ingredients.map(lotRows).joined())</table>"
        for sub in s.subtasks {
            body += "<h1 style=\"text-align:left;font-size:13px;margin-top:12px\">Semipreparat: \(esc(sub.recipeName))</h1>"
            body += "<table>\(tableHead)\(sub.ingredients.map(lotRows).joined())</table>"
        }
        return HTMLPrinter.document(title: "Fișă de trasabilitate", body: body)
    }

    @ViewBuilder
    private func content(_ s: TaskTraceability) -> some View {
        List {
            Section("Produs") {
                LabeledContent("Denumire", value: s.recipeName)
                LabeledContent("Tip", value: s.recipeType.displayName)
                LabeledContent("Cantitate țintă", value: "\(s.targetUnit.formatQty(s.targetQuantity))")
                if let y = s.actualYield {
                    LabeledContent("Cantitate reală", value: "\(s.targetUnit.formatQty(y))")
                }
            }

            Section("Producție") {
                LabeledContent("Creat de", value: s.createdByName)
                if let a = s.assignedToName {
                    LabeledContent("Executat de", value: a)
                }
                if let started = s.startedAt {
                    LabeledContent("Început", value: RoDate.shortDateTime(started))
                }
                if let completed = s.completedAt {
                    LabeledContent("Finalizat", value: RoDate.shortDateTime(completed))
                }
                if let notes = s.notes, !notes.isEmpty {
                    LabeledContent("Note", value: notes)
                }
            }

            ingredientsSection(title: "Ingrediente consumate", items: s.ingredients)

            ForEach(s.subtasks) { sub in
                ingredientsSection(
                    title: "Semipreparat: \(sub.recipeName) (\(sub.unit.formatQty(sub.quantity)))",
                    items: sub.ingredients
                )
            }

            if !s.history.isEmpty {
                Section("Istoric stări") {
                    ForEach(s.history) { h in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(h.toStatus.displayName).font(.subheadline.weight(.medium))
                                Text(h.byName).font(.caption).foregroundStyle(.secondary)
                                if let reason = h.reason, !reason.isEmpty {
                                    Text(reason).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Text(RoDate.shortDateTime(h.at))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func ingredientsSection(title: String, items: [TraceabilityIngredient]) -> some View {
        Section(title) {
            if items.isEmpty {
                Text("Fără consum înregistrat").foregroundStyle(.secondary)
            } else {
                ForEach(items) { ing in
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                        HStack {
                            Text(ing.title).font(.subheadline.weight(.medium))
                            Spacer()
                            Text("\(ing.unit.formatQty(ing.quantity))")
                                .font(.subheadline)
                        }
                        if ing.lots.isEmpty {
                            // Pre-FIFO tasks: single heuristic lot on the ingredient.
                            let details = [
                                ing.supplier.map { "Furnizor: \($0)" },
                                ing.lotNumber.map { "Lot: \($0)" },
                                ing.invoiceNumber.map { "Factură: \($0)" },
                                ing.expiryDate.map { "Exp: \(RoDate.shortDate($0))" },
                            ].compactMap { $0 }
                            if !details.isEmpty {
                                Text(details.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        } else {
                            ForEach(ing.lots) { lot in
                                let details = [
                                    "\(ing.unit.formatQty(lot.quantity))",
                                    lot.lotNumber.map { "Lot: \($0)" },
                                    lot.invoiceNumber.map { "Factură: \($0)" },
                                    lot.supplier,
                                    lot.expiryDate.map { "Exp: \(RoDate.shortDate($0))" },
                                ].compactMap { $0 }
                                Text(details.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(.secondary)
                                    .padding(.leading, AppTheme.Spacing.sm)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func format(_ v: Double) -> String { v.qtyFormatted }

    private func shareText(_ s: TaskTraceability) -> String {
        var lines = [
            "FISA DE TRASABILITATE",
            "=====================",
            "Produs: \(s.recipeName) (\(s.recipeType.displayName))",
            "Cantitate: \(s.targetUnit.formatQty(s.actualYield ?? s.targetQuantity))",
            "Executat de: \(s.assignedToName ?? s.createdByName)",
        ]
        if let c = s.completedAt {
            lines.append("Finalizat: \(RoDate.shortDateTime(c))")
        }
        lines.append("")
        lines.append("Ingrediente consumate:")
        for ing in s.ingredients {
            lines.append(shareLine(ing))
        }
        for sub in s.subtasks {
            lines.append("")
            lines.append("Semipreparat \(sub.recipeName):")
            for ing in sub.ingredients {
                lines.append(shareLine(ing))
            }
        }
        return lines.joined(separator: "\n")
    }

    private func shareLine(_ ing: TraceabilityIngredient) -> String {
        var l = "- \(ing.title): \(ing.unit.formatQty(ing.quantity))"
        if ing.lots.isEmpty {
            var details = [
                ing.lotNumber.map { "lot \($0)" },
                ing.invoiceNumber.map { "factură \($0)" },
            ].compactMap { $0 }
            if let supplier = ing.supplier { details.append("furnizor \(supplier)") }
            if let exp = ing.expiryDate { details.append("exp \(RoDate.shortDate(exp))") }
            if !details.isEmpty { l += " (\(details.joined(separator: ", ")))" }
            return l
        }
        // One line per consumed lot, FIFO order.
        for lot in ing.lots {
            var details = [
                lot.lotNumber.map { "lot \($0)" },
                lot.invoiceNumber.map { "factură \($0)" },
            ].compactMap { $0 }
            if let supplier = lot.supplier { details.append("furnizor \(supplier)") }
            if let exp = lot.expiryDate { details.append("exp \(RoDate.shortDate(exp))") }
            l += "\n    • \(ing.unit.formatQty(lot.quantity))"
            if !details.isEmpty { l += " — \(details.joined(separator: ", "))" }
        }
        return l
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            sheet = try await TaskService.shared.fetchTraceability(id: taskId)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
