import SwiftUI

/// Documente card: delivery note (aviz), conformity certificate and invoice —
/// the same actions the old detail list offered, restyled as card rows.
struct OrderDocumentsCard: View {
    let order: OrderResponse
    let certificate: ConformityCertificateResponse?
    let canReadNote: Bool
    let canCreateNote: Bool
    let canEditInvoice: Bool
    let isGeneratingCert: Bool
    let isDownloadingCert: Bool
    let isUploadingInvoice: Bool
    let actions: Actions

    struct Actions {
        let openNote: () -> Void
        let createNote: () -> Void
        let sign: () -> Void
        let generateCertificate: () -> Void
        let previewCertificate: () -> Void
        let uploadInvoice: () -> Void
        let shareInvoice: () -> Void
        let deleteInvoice: () -> Void
    }

    var body: some View {
        HCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                OrderCardTitle("Documente")
                    .padding(.horizontal, 14)
                    .padding(.top, 12)
                    .padding(.bottom, 4)
                if canReadNote { noteRows }
                if canEditInvoice { invoiceRow }
            }
            .padding(.bottom, 4)
        }
    }

    // MARK: - Aviz + certificat

    @ViewBuilder
    private var noteRows: some View {
        if let note = order.deliveryNote {
            row(icon: "doc.text", title: "Aviz de livrare",
                subtitle: [note.serialNumber.map { "Seria \($0)" },
                           note.hasSignature ? "semnat de \(note.signedByName ?? "–")" : "nesemnat"]
                    .compactMap { $0 }.joined(separator: " · "),
                warn: !note.hasSignature, action: actions.openNote) {
                Image(systemName: "chevron.right").foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .tutorialAnchor(id: "orders.create.deliveryNote")
            if !note.hasSignature {
                row(icon: "signature", title: "Semnează la predare", action: actions.sign) { EmptyView() }
            }
            if let certificate {
                row(icon: "checkmark.seal.fill", title: "Certificat de conformitate",
                    subtitle: "Seria \(certificate.serialNumber)", action: actions.previewCertificate) {
                    if isDownloadingCert { ProgressView() } else {
                        Image(systemName: "eye").foregroundStyle(AppTheme.Colors.secondaryLabel)
                    }
                }
                .disabled(isDownloadingCert)
            } else if canCreateNote {
                row(icon: "checkmark.seal", title: "Generează certificat de conformitate",
                    action: actions.generateCertificate) {
                    if isGeneratingCert { ProgressView() }
                }
                .disabled(isGeneratingCert)
            }
        } else if canCreateNote {
            row(icon: "doc.badge.plus", title: "Generează aviz de livrare", action: actions.createNote) { EmptyView() }
        }
    }

    // MARK: - Factură

    @ViewBuilder
    private var invoiceRow: some View {
        if order.hasInvoice == true {
            HStack(spacing: 4) {
                row(icon: "doc.richtext", title: order.invoiceFileName ?? "Factură",
                    subtitle: "Factură", action: actions.shareInvoice) { EmptyView() }
                Button(role: .destructive, action: actions.deleteInvoice) {
                    Image(systemName: "trash")
                        .foregroundStyle(AppTheme.Status.fg(.danger))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Șterge factura")
                .help("Șterge factura")
                .padding(.trailing, 6)
            }
        } else {
            row(icon: "doc.badge.plus", title: "Încarcă factură", action: actions.uploadInvoice) {
                if isUploadingInvoice { ProgressView() }
            }
            .disabled(isUploadingInvoice)
        }
    }

    // MARK: - Row

    private func row<Trailing: View>(
        icon: String, title: String, subtitle: String? = nil, warn: Bool = false,
        action: @escaping () -> Void, @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.body)
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .frame(width: 28)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(AppFont.body(14, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.label)
                    if let subtitle {
                        Text(subtitle)
                            .font(AppFont.body(11))
                            .foregroundStyle(warn ? AppTheme.Status.fg(.warning) : AppTheme.Colors.secondaryLabel)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                trailing()
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
