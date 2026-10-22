import SwiftUI
import Observation

@Observable
final class TransferApprovalViewModel {
    var transfer: TransferResponse?
    var isLoading = true
    var isSubmitting = false
    var error: APIError?
    var reason = ""

    private let service = LocationService.shared

    func load(transferId: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            transfer = try await service.fetchTransfer(id: transferId)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func approve(transferId: String) async -> Bool {
        return await submitApproval(transferId: transferId, status: "APPROVED")
    }

    func reject(transferId: String) async -> Bool {
        return await submitApproval(transferId: transferId, status: "REJECTED")
    }

    private func submitApproval(transferId: String, status: String) async -> Bool {
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            let body = UpdateTransferApprovalRequest(
                status: status,
                reason: reason.isEmpty ? nil : reason
            )
            transfer = try await service.updateTransferApproval(transferId: transferId, body: body)
            return true
        } catch let err as APIError {
            error = err
            return false
        } catch {
            self.error = .networkError(error)
            return false
        }
    }
}

struct TransferApprovalView: View {
    let transferId: String
    @State private var viewModel = TransferApprovalViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.transfer == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let transfer = viewModel.transfer {
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.md) {
                        transferInfoCard(transfer)
                        itemsList(transfer)
                        approvalSection
                    }
                    .padding()
                }
            } else {
                ContentUnavailableView(
                    "Eroare",
                    systemImage: "exclamationmark.triangle",
                    description: Text("Nu s-au putut încărca datele")
                )
            }
        }
        .navigationTitle("Aprobare transfer")
        .task { await viewModel.load(transferId: transferId) }
        .errorAlert($viewModel.error)
    }

    // MARK: - Transfer Info

    private func transferInfoCard(_ transfer: TransferResponse) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Label("De la: \(transfer.fromLocation.name)", systemImage: "arrow.up.right.circle")
                .font(.subheadline)
            Label("Către: \(transfer.toLocation.name)", systemImage: "arrow.down.left.circle")
                .font(.subheadline)
            Label("Creat de: \(transfer.createdBy.fullName)", systemImage: "person")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                Text("Status:")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStatusChip(transfer.status.displayName, kind: transfer.status.kind)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - Items

    private func itemsList(_ transfer: TransferResponse) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text("Produse (\(transfer.items.count))")
                .font(.headline)

            ForEach(transfer.items) { item in
                HStack {
                    Text(item.rawMaterialTitle)
                        .font(.subheadline)
                    Spacer()
                    Text("\(item.unit.formatQty(item.quantity))")
                        .font(.subheadline.weight(.medium))
                }
                .padding(.vertical, AppTheme.Spacing.xxs)
            }
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - Approval Actions

    private var approvalSection: some View {
        VStack(spacing: AppTheme.Spacing.sm) {
            TextField("Motiv (opțional)", text: $viewModel.reason, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(2...4)

            HStack(spacing: AppTheme.Spacing.md) {
                Button {
                    Task {
                        if await viewModel.reject(transferId: transferId) {
                            dismiss()
                        }
                    }
                } label: {
                    Label("Respinge", systemImage: "xmark.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .disabled(viewModel.isSubmitting)

                Button {
                    Task {
                        if await viewModel.approve(transferId: transferId) {
                            dismiss()
                        }
                    }
                } label: {
                    Label("Aprobă", systemImage: "checkmark.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isSubmitting)
            }
        }
    }
}

#Preview {
    NavigationStack {
        TransferApprovalView(transferId: "preview")
    }
}
