import SwiftUI
import UIKit

struct DeliveryNoteView: View {
    let orderId: String
    @State private var viewModel: OrderDetailViewModel
    @State private var signatureImage: UIImage?
    @State private var isExporting = false

    init(orderId: String) {
        self.orderId = orderId
        self._viewModel = State(initialValue: OrderDetailViewModel(orderId: orderId))
    }

    var body: some View {
        Group {
            if let order = viewModel.order, let note = order.deliveryNote {
                List {
                    Section("Detalii livrare") {
                        if let serial = note.serialNumber {
                            LabeledContent("Serie", value: serial)
                        }
                        LabeledContent("Punct livrare", value: note.deliveryPoint)
                        LabeledContent("Adresa", value: note.deliveryAddress)
                        LabeledContent("Generat la", value: RoDate.fullDateTime(note.generatedAt))
                    }

                    Section("Produse") {
                        ForEach(order.items) { item in
                            HStack {
                                Text(item.recipeName)
                                Spacer()
                                Text(item.unit.formatQty(item.quantity))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    if note.hasSignature {
                        Section("Semnatura") {
                            LabeledContent("Semnat de", value: note.signedByName ?? "–")
                            if let signedAt = note.signedAt {
                                LabeledContent("Data", value: RoDate.fullDateTime(signedAt))
                            }
                            if let signatureImage {
                                Image(uiImage: signatureImage)
                                    .resizable()
                                    .scaledToFit()
                                    .frame(height: 120)
                                    .background(Color.white)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }

                    Section {
                        Button {
                            Task { await exportPDF() }
                        } label: {
                            if isExporting {
                                ProgressView()
                            } else {
                                HStack {
                                    Image(systemName: "square.and.arrow.up")
                                        .foregroundStyle(AppTheme.Colors.primaryText)
                                    Text("Exporta PDF")
                                        .foregroundStyle(Color.primary)
                                }
                            }
                        }
                        .disabled(isExporting)
                    }
                }
            } else if viewModel.isLoading {
                ProgressView()
            } else if let order = viewModel.order, order.deliveryNote == nil {
                ContentUnavailableView(
                    "Foaie negenerata",
                    systemImage: "doc.text",
                    description: Text("Foaia de parcurs nu a fost generata inca pentru aceasta comanda")
                )
            } else {
                ContentUnavailableView(
                    "Eroare la incarcare",
                    systemImage: "exclamationmark.triangle",
                    description: Text("Nu s-a putut incarca foaia de parcurs")
                )
            }
        }
        .navigationTitle("Foaie de parcurs")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.loadOrder()
            if let b64 = viewModel.order?.deliveryNote?.signatureImageBase64,
               let data = Data(base64Encoded: b64) {
                signatureImage = UIImage(data: data)
            }
        }
        .errorAlert($viewModel.error)
    }

    // MARK: - PDF Generation

    @MainActor
    private func exportPDF() async {
        guard let order = viewModel.order else { return }
        isExporting = true
        defer { isExporting = false }

        // Use signature from response or cached
        var sigImg = signatureImage
        if sigImg == nil, let b64 = order.deliveryNote?.signatureImageBase64,
           let data = Data(base64Encoded: b64) {
            sigImg = UIImage(data: data)
            signatureImage = sigImg
        }

        let pageRect = CGRect(x: 0, y: 0, width: 595.2, height: 841.8) // A4
        let margin: CGFloat = 50

        let renderer = UIGraphicsPDFRenderer(bounds: pageRect)
        let data = renderer.pdfData { context in
            context.beginPage()

            var y: CGFloat = margin

            let titleAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 22),
            ]
            let bodyAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 12),
            ]
            let boldAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 12),
            ]

            // Title
            "\(BrandingManager.shared.organizationName) — Foaie de Parcurs".draw(at: CGPoint(x: margin, y: y), withAttributes: titleAttrs)
            y += 35

            // Serial number
            if let serial = order.deliveryNote?.serialNumber {
                "Serie: \(serial)".draw(at: CGPoint(x: margin, y: y), withAttributes: boldAttrs)
                y += 20
            }

            // Order info
            "Comandă: \(order.orderNumber)".draw(at: CGPoint(x: margin, y: y), withAttributes: boldAttrs)
            y += 20
            "Data: \(RoDate.fullDateTime(order.createdAt))".draw(at: CGPoint(x: margin, y: y), withAttributes: bodyAttrs)
            y += 20
            "Punct livrare: \(order.deliveryPoint)".draw(at: CGPoint(x: margin, y: y), withAttributes: bodyAttrs)
            y += 20
            if let address = order.deliveryAddress {
                "Adresă: \(address)".draw(at: CGPoint(x: margin, y: y), withAttributes: bodyAttrs)
                y += 20
            }
            y += 15

            // Items table header
            let headerAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 11),
            ]
            "Produs".draw(at: CGPoint(x: margin, y: y), withAttributes: headerAttrs)
            "Cantitate".draw(at: CGPoint(x: 350, y: y), withAttributes: headerAttrs)
            "Unitate".draw(at: CGPoint(x: 440, y: y), withAttributes: headerAttrs)
            y += 18

            // Separator
            let ctx = context.cgContext
            ctx.setStrokeColor(UIColor.gray.cgColor)
            ctx.setLineWidth(0.5)
            ctx.move(to: CGPoint(x: margin, y: y))
            ctx.addLine(to: CGPoint(x: pageRect.width - margin, y: y))
            ctx.strokePath()
            y += 8

            // Items
            let cellAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 11),
            ]
            for item in order.items {
                let h = item.unit.documentScaled(item.quantity)
                item.recipeName.draw(at: CGPoint(x: margin, y: y), withAttributes: cellAttrs)
                h.value.qtyFormatted.draw(at: CGPoint(x: 350, y: y), withAttributes: cellAttrs)
                h.unit.abbreviation.draw(at: CGPoint(x: 440, y: y), withAttributes: cellAttrs)
                y += 18
            }

            y += 30

            // Signature area
            if let note = order.deliveryNote {
                if note.hasSignature {
                    "Semnat de: \(note.signedByName ?? "–")".draw(at: CGPoint(x: margin, y: y), withAttributes: boldAttrs)
                    y += 20
                    if let signedAt = note.signedAt {
                        "Data semnării: \(RoDate.fullDateTime(signedAt))".draw(at: CGPoint(x: margin, y: y), withAttributes: bodyAttrs)
                        y += 20
                    }

                    // Draw signature image
                    if let sigImg {
                        y += 5
                        let sigWidth: CGFloat = 200
                        let sigHeight = sigWidth * (sigImg.size.height / sigImg.size.width)
                        let sigRect = CGRect(x: margin, y: y, width: sigWidth, height: min(sigHeight, 100))
                        sigImg.draw(in: sigRect)
                        y += min(sigHeight, 100)
                    }
                } else {
                    "Semnatura: ___________________________".draw(at: CGPoint(x: margin, y: y), withAttributes: bodyAttrs)
                    y += 30
                    "Numele: ___________________________".draw(at: CGPoint(x: margin, y: y), withAttributes: bodyAttrs)
                    y += 30
                    "Data: ___________________________".draw(at: CGPoint(x: margin, y: y), withAttributes: bodyAttrs)
                }
            }
        }

        // Share
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("FoaieParcurs_\(order.orderNumber).pdf")
        try? data.write(to: tempURL)

        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootVC = windowScene.windows.first?.rootViewController else { return }

        let activityVC = UIActivityViewController(activityItems: [tempURL], applicationActivities: nil)
        rootVC.present(activityVC, animated: true)
    }
}
