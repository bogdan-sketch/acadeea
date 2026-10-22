import SwiftUI

/// "Revizie stocuri": one Excel with everything the app keeps as stock, one row
/// per lot (name, supplier, invoice, expiry, purchase price, quantity) on four
/// sheets. The phone exports and shares it; the corrected file is uploaded back
/// on the web (Stoc › Revizie stocuri), where the report of changes is shown.
struct StockReviewView: View {
    @State private var exportURL: URL?
    @State private var isExporting = false
    @State private var error: APIError?

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Label("Materii prime · Consumabile · Semipreparate · Produse finite", systemImage: "tablecells")
                        .font(.subheadline.weight(.semibold))
                    Text("Un lot = un rând, cu furnizor, factură, data expirării, preț de achiziție și cantitate. Stocul fără lot apare ca rând „STOC”.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, AppTheme.Spacing.xs)
            }

            Section {
                if let exportURL {
                    ShareLink(item: exportURL) {
                        Label("Trimite fișierul Excel", systemImage: "square.and.arrow.up")
                    }
                    Button {
                        self.exportURL = nil
                        Task { await export() }
                    } label: {
                        Label("Exportă din nou", systemImage: "arrow.clockwise")
                    }
                } else {
                    Button {
                        Task { await export() }
                    } label: {
                        HStack {
                            Label("Exportă Excel", systemImage: "square.and.arrow.down")
                            if isExporting {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(isExporting)
                }
            } footer: {
                Text("Corectează Cantitate, Preț achiziție, Data expirare sau Furnizor și încarcă fișierul pe web, la Stoc › Revizie stocuri. Se ajustează doar rândurile din fișier, iar aplicația arată raportul cu ce s-a schimbat.")
            }
        }
        .navigationTitle("Revizie stocuri")
        .navigationBarTitleDisplayMode(.inline)
        .errorAlert($error)
    }

    private func export() async {
        isExporting = true
        defer { isExporting = false }
        do {
            let data = try await StockService.shared.fetchStockReviewXlsx()
            let date = ISO8601DateFormatter().string(from: Date()).prefix(10)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("revizie-stocuri-\(date).xlsx")
            try data.write(to: url, options: .atomic)
            exportURL = url
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
