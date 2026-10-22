import SwiftUI

@Observable
final class IntegrationDetailViewModel {
    var integration: Integration?
    var mappings: [ProductMapping] = []
    var externalOrders: [ExternalOrder] = []
    var isLoading = true
    var error: APIError?
    var syncResult: SyncResult?
    var isSyncing = false
    var showAddMapping = false

    private let service = IntegrationService.shared
    let integrationId: String

    init(integrationId: String) {
        self.integrationId = integrationId
    }

    func load() async {
        isLoading = true
        error = nil
        do {
            async let i = service.fetch(id: integrationId)
            async let m = service.fetchMappings(integrationId: integrationId)
            async let o = service.fetchExternalOrders(integrationId: integrationId)
            integration = try await i
            mappings = try await m
            externalOrders = try await o
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isLoading = false
    }

    func toggleStatus() async {
        guard let current = integration else { return }
        let newStatus = current.isActive ? "INACTIVE" : "ACTIVE"
        do {
            integration = try await service.update(
                id: integrationId,
                dto: UpdateIntegrationRequest(status: newStatus, config: nil)
            )
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
    }

    func sync() async {
        isSyncing = true
        do {
            syncResult = try await service.triggerSync(integrationId: integrationId)
            await load()
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isSyncing = false
    }

    func deleteMapping(id: String) async {
        do {
            try await service.deleteMapping(integrationId: integrationId, mappingId: id)
            mappings.removeAll { $0.id == id }
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
    }
}

struct IntegrationDetailView: View {
    @State private var viewModel: IntegrationDetailViewModel

    init(integrationId: String) {
        _viewModel = State(initialValue: IntegrationDetailViewModel(integrationId: integrationId))
    }

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let integration = viewModel.integration {
                ScrollView {
                    VStack(spacing: 16) {
                        statusCard(integration)
                        mappingsSection
                        externalOrdersSection
                    }
                    .padding()
                }
                .refreshable { await Task { await viewModel.load() }.value }
            } else {
                ContentUnavailableView("Integrare negasita", systemImage: "link.badge.plus")
            }
        }
        .navigationTitle(viewModel.integration?.providerDisplayName ?? "Integrare")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        Task { await viewModel.toggleStatus() }
                    } label: {
                        Label(
                            viewModel.integration?.isActive == true ? "Dezactiveaza" : "Activeaza",
                            systemImage: viewModel.integration?.isActive == true ? "pause.circle" : "play.circle"
                        )
                    }
                    Button {
                        Task { await viewModel.sync() }
                    } label: {
                        Label("Sincronizeaza", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .disabled(viewModel.isSyncing)
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $viewModel.showAddMapping) {
            AddProductMappingSheet(integrationId: viewModel.integrationId) { _ in
                Task { await viewModel.load() }
            }
        }
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
    }

    // MARK: - Status Card

    private func statusCard(_ integration: Integration) -> some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: integration.provider == "EBRIZA" ? "storefront" : "cart")
                        .font(.largeTitle)
                    VStack(alignment: .leading) {
                        Text(integration.providerDisplayName).font(.title2).fontWeight(.bold)
                        Text(integration.statusDisplayName)
                            .font(.subheadline)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(integration.isActive ? Color.green.opacity(0.15) : Color.gray.opacity(0.15))
                            .foregroundStyle(integration.isActive ? .green : .gray)
                            .clipShape(Capsule())
                    }
                }

                if let lastSync = integration.lastSyncAt {
                    LabeledContent("Ultima sincronizare", value: lastSync.prefix(10).description)
                }

                LabeledContent("Mapari produse", value: "\(integration.mappingsCount)")

                if let result = viewModel.syncResult {
                    HStack {
                        Label("\(result.synced) sincronizate", systemImage: "checkmark.circle")
                            .foregroundStyle(.green)
                        if result.failed > 0 {
                            Label("\(result.failed) esuate", systemImage: "xmark.circle")
                                .foregroundStyle(.red)
                        }
                    }
                    .font(.caption)
                }

                if viewModel.isSyncing {
                    HStack {
                        ProgressView()
                        Text("Se sincronizeaza...").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    // MARK: - Mappings

    private var mappingsSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Mapari produse").font(.headline)
                    Spacer()
                    Button {
                        viewModel.showAddMapping = true
                    } label: {
                        Image(systemName: "plus.circle")
                    }
                }

                if viewModel.mappings.isEmpty {
                    Text("Nicio mapare configurata.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 8)
                } else {
                    ForEach(viewModel.mappings) { mapping in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(mapping.externalProductName)
                                    .font(.subheadline)
                                Text("→ \(mapping.recipeName)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(role: .destructive) {
                                Task { await viewModel.deleteMapping(id: mapping.id) }
                            } label: {
                                Image(systemName: "trash")
                                    .font(.caption)
                            }
                        }
                        if mapping.id != viewModel.mappings.last?.id {
                            Divider()
                        }
                    }
                }
            }
        }
    }

    // MARK: - External Orders

    private var externalOrdersSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 8) {
                Text("Comenzi externe").font(.headline)

                if viewModel.externalOrders.isEmpty {
                    Text("Nicio comanda externa.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 8)
                } else {
                    ForEach(viewModel.externalOrders.prefix(20)) { order in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("ID: \(order.externalId)")
                                    .font(.subheadline)
                                if let err = order.errorMessage {
                                    Text(err)
                                        .font(.caption2)
                                        .foregroundStyle(.red)
                                }
                            }
                            Spacer()
                            Text(order.syncStatusDisplayName)
                                .font(.caption)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(syncStatusColor(order.syncStatus).opacity(0.15))
                                .foregroundStyle(syncStatusColor(order.syncStatus))
                                .clipShape(Capsule())
                        }
                        if order.id != viewModel.externalOrders.prefix(20).last?.id {
                            Divider()
                        }
                    }
                }
            }
        }
    }

    private func syncStatusColor(_ status: String) -> Color {
        switch status {
        case "SYNCED": return .green
        case "FAILED": return .red
        case "PENDING": return .orange
        default: return .gray
        }
    }
}

// MARK: - Add Product Mapping Sheet

struct AddProductMappingSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var externalProductId = ""
    @State private var externalProductName = ""
    @State private var recipeId = ""
    @State private var isSaving = false
    @State private var error: APIError?

    let integrationId: String
    var onCreated: (ProductMapping) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Produs extern") {
                    TextField("ID produs extern", text: $externalProductId)
                    TextField("Nume produs extern", text: $externalProductName)
                }
                Section("Reteta interna") {
                    TextField("ID reteta", text: $recipeId)
                }
            }
            .navigationTitle("Mapare noua")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        Image(systemName: "checkmark")
                    }
                    .disabled(externalProductId.isEmpty || externalProductName.isEmpty || recipeId.isEmpty || isSaving)
                }
            }
            .errorAlert($error)
        }
    }

    private func save() async {
        isSaving = true
        do {
            let dto = CreateProductMappingRequest(
                externalProductId: externalProductId,
                externalProductName: externalProductName,
                recipeId: recipeId
            )
            let mapping = try await IntegrationService.shared.createMapping(
                integrationId: integrationId,
                dto: dto
            )
            onCreated(mapping)
            dismiss()
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isSaving = false
    }
}
