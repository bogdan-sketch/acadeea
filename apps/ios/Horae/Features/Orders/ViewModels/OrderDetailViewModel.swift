import Foundation
import Observation

@Observable
final class OrderDetailViewModel {
    var order: OrderResponse?
    var isLoading = false
    var error: APIError?
    /// True while a status change is in flight (disables the action bar).
    var isUpdatingStatus = false
    /// Pickup location of a PICKUP order (name + address for "De la").
    var pickupLocation: LocationResponse?

    private let service = OrderService.shared
    private let orderId: String

    init(orderId: String) {
        self.orderId = orderId
    }

    func loadOrder() async {
        isLoading = true
        defer { isLoading = false }

        do {
            order = try await service.fetchOrder(id: orderId)
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.networkError(error)
        }
        await loadPickupLocation()
    }

    /// Resolves `pickupLocationId` to a location (best effort — the row falls
    /// back to the delivery point when locations can't be read).
    private func loadPickupLocation() async {
        guard let id = order?.pickupLocationId, pickupLocation?.id != id else { return }
        pickupLocation = try? await LocationService.shared.fetchLocations().first { $0.id == id }
    }

    /// Saves the edit sheet's fields (point, address, notes, due date).
    func updateDetails(_ request: UpdateOrderRequest) async -> Bool {
        do {
            order = try await service.updateOrder(id: orderId, request)
            return true
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.networkError(error)
        }
        return false
    }

    func updateStatus(_ newStatus: OrderStatus) async {
        isUpdatingStatus = true
        defer { isUpdatingStatus = false }
        do {
            order = try await service.updateOrder(id: orderId, UpdateOrderRequest(status: newStatus))
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.networkError(error)
        }
    }

    func createDeliveryNote() async {
        do {
            order = try await service.createDeliveryNote(orderId: orderId)
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.networkError(error)
        }
    }

    func signDeliveryNote(signedByName: String, signatureImage: Data) async {
        do {
            order = try await service.signDeliveryNote(
                orderId: orderId,
                signedByName: signedByName,
                signatureImage: signatureImage
            )
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.networkError(error)
        }
    }

    var isUploadingInvoice = false

    func uploadInvoice(data: Data, fileName: String, mimeType: String) async {
        isUploadingInvoice = true
        defer { isUploadingInvoice = false }
        do {
            order = try await service.uploadInvoice(orderId: orderId, fileData: data, fileName: fileName, mimeType: mimeType)
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.networkError(error)
        }
    }

    func deleteInvoice() async {
        do {
            order = try await service.deleteInvoice(orderId: orderId)
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.networkError(error)
        }
    }

    func downloadInvoice() async -> (data: Data, fileName: String, mimeType: String)? {
        do {
            return try await service.downloadInvoice(orderId: orderId)
        } catch {
            self.error = (error as? APIError) ?? APIError.networkError(error)
            return nil
        }
    }

    func updateItemStatus(itemId: String, status: OrderItemStatus) async {
        do {
            order = try await service.updateItem(
                orderId: orderId,
                itemId: itemId,
                UpdateOrderItemRequest(status: status)
            )
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.networkError(error)
        }
    }
}
