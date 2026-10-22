import SwiftUI
import QuickLook
import UniformTypeIdentifiers

/// Order detail (Comanda): header + status stepper, Produse, Predare, Note,
/// Documente, Istoric, and a bottom bar with edit + "Marchează „…”".
/// Icon-only actions (aviz PDF, semnătură, anulează) sit in the native
/// navigation bar so the system back button and swipe-back keep working.
struct OrderDetailView: View {
    let orderId: String
    @State private var viewModel: OrderDetailViewModel
    @State private var showSignatureSheet = false
    @State private var showInvoicePicker = false
    @State private var showEditSheet = false
    @State private var showCancelConfirm = false
    @State private var certificate: ConformityCertificateResponse?
    @State private var isGeneratingCert = false
    @State private var isDownloadingCert = false
    @State private var certificatePreviewURL: URL?
    @State private var statusChanged = 0
    @Environment(\.routeNavigator) private var navigator

    init(orderId: String) {
        self.orderId = orderId
        self._viewModel = State(initialValue: OrderDetailViewModel(orderId: orderId))
    }

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }
    private var canUpdate: Bool { permissions.can(.update, .Order) }

    var body: some View {
        Group {
            if let order = viewModel.order {
                content(order)
            } else if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView(
                    "Eroare la încărcare",
                    systemImage: "exclamationmark.triangle",
                    description: Text("Nu s-a putut încărca comanda")
                )
            }
        }
        .appScreenBackground(showsGradient: false)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { if let order = viewModel.order { toolbarActions(order) } }
        .task {
            await viewModel.loadOrder()
            await loadCertificate()
        }
        .task {
            // Short names for the "Metodă" row when opened outside the list (deep link).
            let area = OrdersAreaState.shared
            if area.isWooDeliveryEnabled, area.methods.isEmpty { await area.loadMethods() }
        }
        .quickLookPreview($certificatePreviewURL)
        .errorAlert($viewModel.error)
        .sensoryFeedback(.success, trigger: statusChanged)
        .sheet(isPresented: $showSignatureSheet) {
            SignatureCaptureSheet { name, imageData in
                Task { await viewModel.signDeliveryNote(signedByName: name, signatureImage: imageData) }
                showSignatureSheet = false
            }
        }
        .sheet(isPresented: $showEditSheet) {
            if let order = viewModel.order {
                EditOrderSheet(order: order) { await viewModel.updateDetails($0) }
            }
        }
        .confirmationDialog(
            "Anulezi comanda?", isPresented: $showCancelConfirm, titleVisibility: .visible
        ) {
            Button("Anulează comanda", role: .destructive) { advance(to: .ANULATA) }
            Button("Renunță", role: .cancel) {}
        } message: {
            Text("Comanda trece în „Anulată” și nu mai poate fi reluată.")
        }
        .fileImporter(
            isPresented: $showInvoicePicker,
            allowedContentTypes: [.pdf, .jpeg, .png],
            allowsMultipleSelection: false
        ) { importInvoice($0) }
    }

    // MARK: - Content

    private func content(_ order: OrderResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                OrderDetailHeader(order: order, pickupLocation: viewModel.pickupLocation)
                OrderStatusStepper(status: order.status)
                    .tutorialAnchor(id: "orders.create.status")
                OrderItemsCard(items: order.items)
                OrderHandoverCard(order: order, pickupLocation: viewModel.pickupLocation)
                if let notes = order.notes, !notes.isEmpty {
                    OrderNotesCard(notes: notes)
                }
                if permissions.can(.read, .DeliveryNote) || canUpdate {
                    documentsCard(order)
                }
                OrderHistoryCard(order: order)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 16)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await Task { await viewModel.loadOrder() }.value }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            OrderActionBar(
                status: order.status,
                canEdit: canUpdate && order.status.isOpen,
                canAdvance: canUpdate,
                isBusy: viewModel.isUpdatingStatus,
                onEdit: { showEditSheet = true },
                onAdvance: { advance(to: $0) }
            )
        }
    }

    @ToolbarContentBuilder
    private func toolbarActions(_ order: OrderResponse) -> some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            if permissions.can(.read, .DeliveryNote), order.deliveryNote != nil || permissions.can(.create, .DeliveryNote) {
                Button { openDeliveryNote(order) } label: { Image(systemName: "doc.text") }
                    .accessibilityLabel("Aviz de livrare PDF")
                    .help(order.deliveryNote == nil ? "Generează avizul de livrare" : "Aviz de livrare (PDF)")
            }
            if let note = order.deliveryNote, !note.hasSignature {
                Button { showSignatureSheet = true } label: { Image(systemName: "signature") }
                    .accessibilityLabel("Semnătură la predare")
                    .help("Semnătură la predare")
            }
            if canUpdate, order.status.allowedTransitions.contains(.ANULATA) {
                Button { showCancelConfirm = true } label: {
                    Image(systemName: "nosign").foregroundStyle(AppTheme.Status.fg(.danger))
                }
                .accessibilityLabel("Anulează comanda")
                .help("Anulează comanda (se cere confirmare)")
            }
        }
    }

    private func documentsCard(_ order: OrderResponse) -> some View {
        OrderDocumentsCard(
            order: order,
            certificate: certificate,
            canReadNote: permissions.can(.read, .DeliveryNote),
            canCreateNote: permissions.can(.create, .DeliveryNote),
            canEditInvoice: canUpdate,
            isGeneratingCert: isGeneratingCert,
            isDownloadingCert: isDownloadingCert,
            isUploadingInvoice: viewModel.isUploadingInvoice,
            actions: .init(
                openNote: { navigator.push(.orderDeliveryNote(id: order.id)) },
                createNote: { Task { await viewModel.createDeliveryNote() } },
                sign: { showSignatureSheet = true },
                generateCertificate: { Task { await generateCertificate() } },
                previewCertificate: { Task { await previewCertificate() } },
                uploadInvoice: { showInvoicePicker = true },
                shareInvoice: {
                    Task {
                        if let result = await viewModel.downloadInvoice() {
                            shareInvoice(data: result.data, fileName: result.fileName)
                        }
                    }
                },
                deleteInvoice: { Task { await viewModel.deleteInvoice() } }
            )
        )
    }

    // MARK: - Actions

    private func advance(to status: OrderStatus) {
        Task {
            await viewModel.updateStatus(status)
            if viewModel.order?.status == status { statusChanged += 1 }
        }
    }

    /// Opens the aviz; generates it first when the order has none yet.
    private func openDeliveryNote(_ order: OrderResponse) {
        Task {
            if order.deliveryNote == nil { await viewModel.createDeliveryNote() }
            if viewModel.order?.deliveryNote != nil { navigator.push(.orderDeliveryNote(id: order.id)) }
        }
    }

    private func importInvoice(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else { return }
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }
        guard let data = try? Data(contentsOf: url) else { return }
        let ext = url.pathExtension.lowercased()
        let mime = ext == "pdf" ? "application/pdf" : ext == "png" ? "image/png" : "image/jpeg"
        Task { await viewModel.uploadInvoice(data: data, fileName: url.lastPathComponent, mimeType: mime) }
    }

    private func loadCertificate() async {
        guard viewModel.order?.deliveryNote != nil else { return }
        certificate = try? await OrderService.shared.getConformityCertificate(orderId: orderId)
    }

    private func generateCertificate() async {
        isGeneratingCert = true
        defer { isGeneratingCert = false }
        do {
            _ = try await OrderService.shared.createConformityCertificate(orderId: orderId)
            await loadCertificate()
            await viewModel.loadOrder()
        } catch {
            viewModel.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
    }

    private func previewCertificate() async {
        isDownloadingCert = true
        defer { isDownloadingCert = false }
        do {
            let result = try await OrderService.shared.downloadConformityCertificatePDF(orderId: orderId)
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(result.fileName)
            try result.data.write(to: tempURL)
            certificatePreviewURL = tempURL
        } catch {
            viewModel.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
    }

    @MainActor
    private func shareInvoice(data: Data, fileName: String) {
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        try? data.write(to: tempURL)
        let activityVC = UIActivityViewController(activityItems: [tempURL], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first?.rootViewController else { return }
        root.present(activityVC, animated: true)
    }
}

#Preview("OrderDetailView") {
    NavigationStack {
        OrderDetailView(orderId: "preview")
    }
}
