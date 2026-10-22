import SwiftUI

@Observable
final class IntegrationsListViewModel {
    var integrations: [Integration] = []
    var isLoading = true
    var error: APIError?
    var showAddSheet = false

    private let service = IntegrationService.shared

    func load() async {
        isLoading = true
        error = nil
        do {
            integrations = try await service.fetchAll()
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isLoading = false
    }

    func delete(id: String) async {
        do {
            try await service.delete(id: id)
            integrations.removeAll { $0.id == id }
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
    }
}

struct IntegrationsListView: View {
    @State private var viewModel = IntegrationsListViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.integrations.isEmpty {
                ContentUnavailableView(
                    "Fara integrari",
                    systemImage: "link.badge.plus",
                    description: Text("Adauga o integrare cu eBriza sau WooCommerce.")
                )
            } else {
                List {
                    ForEach(viewModel.integrations) { integration in
                        NavigationLink(value: Route.integrationDetail(id: integration.id)) {
                            IntegrationRowView(integration: integration)
                        }
                    }
                    .onDelete { indexSet in
                        guard let index = indexSet.first else { return }
                        let id = viewModel.integrations[index].id
                        Task { await viewModel.delete(id: id) }
                    }
                }
            }
        }
        .navigationTitle("Integrari")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    viewModel.showAddSheet = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $viewModel.showAddSheet) {
            AddIntegrationSheet { _ in
                Task { await viewModel.load() }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await Task { await viewModel.load() }.value }
        .errorAlert($viewModel.error)
    }
}

// MARK: - Row

struct IntegrationRowView: View {
    let integration: Integration

    var body: some View {
        HStack {
            Image(systemName: integration.provider == "EBRIZA" ? "storefront" : "cart")
                .font(.title2)
                .foregroundStyle(statusColor)
                .frame(width: 40)

            VStack(alignment: .leading, spacing: 4) {
                Text(integration.providerDisplayName)
                    .font(.headline)
                HStack(spacing: 8) {
                    Text(integration.statusDisplayName)
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(statusColor.opacity(0.15))
                        .foregroundStyle(statusColor)
                        .clipShape(Capsule())
                    Text("\(integration.mappingsCount) mapari")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }

    private var statusColor: Color {
        switch integration.status {
        case "ACTIVE": return .green
        case "ERROR": return .red
        default: return .gray
        }
    }
}

// MARK: - Add Sheet

struct AddIntegrationSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedProvider = "EBRIZA"
    @State private var isCreating = false
    @State private var error: APIError?

    var onCreated: (Integration) -> Void

    private let providers = ["EBRIZA", "WOOCOMMERCE"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Provider") {
                    Picker("Provider", selection: $selectedProvider) {
                        Text("eBriza").tag("EBRIZA")
                        Text("WooCommerce").tag("WOOCOMMERCE")
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle("Integrare noua")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Adauga") {
                        Task { await create() }
                    }
                    .disabled(isCreating)
                }
            }
            .errorAlert($error)
        }
    }

    private func create() async {
        isCreating = true
        do {
            let dto = CreateIntegrationRequest(provider: selectedProvider, config: nil)
            let integration = try await IntegrationService.shared.create(dto)
            onCreated(integration)
            dismiss()
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isCreating = false
    }
}
