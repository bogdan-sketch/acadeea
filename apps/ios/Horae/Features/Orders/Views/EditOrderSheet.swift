import SwiftUI

/// Edit sheet behind the action bar's pencil: the order fields the update
/// API accepts (delivery point, address, due date, notes).
struct EditOrderSheet: View {
    let order: OrderResponse
    let onSave: (UpdateOrderRequest) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var deliveryPoint: String
    @State private var deliveryAddress: String
    @State private var notes: String
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var isSaving = false
    @State private var saved = 0

    init(order: OrderResponse, onSave: @escaping (UpdateOrderRequest) async -> Bool) {
        self.order = order
        self.onSave = onSave
        _deliveryPoint = State(initialValue: order.deliveryPoint)
        _deliveryAddress = State(initialValue: order.deliveryAddress ?? "")
        _notes = State(initialValue: order.notes ?? "")
        _hasDueDate = State(initialValue: order.dueDate != nil)
        _dueDate = State(initialValue: order.dueDate ?? Date().addingTimeInterval(86_400))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Punct de livrare", text: $deliveryPoint)
                    TextField("Adresă (opțional)", text: $deliveryAddress, axis: .vertical)
                } header: {
                    Text(order.isPickup ? "Ridicare" : "Livrare")
                } footer: {
                    // UpdateOrderDto has no fulfilment fields: the mode is fixed at creation.
                    Text("Modul de predare (\(order.modeTitle.lowercased())) se alege la crearea comenzii.")
                }
                Section("Termen") {
                    // The API can set a due date but not clear one, so the
                    // toggle only exists while the order has none.
                    if order.dueDate == nil {
                        Toggle("Are termen", isOn: $hasDueDate)
                    }
                    if hasDueDate {
                        DatePicker("Când", selection: $dueDate, displayedComponents: [.date, .hourAndMinute])
                            .environment(\.locale, RoDate.locale)
                            .environment(\.calendar, RoDate.calendar)
                    }
                }
                Section("Note") {
                    TextField("Note pentru echipă", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                }
            }
            .scrollContentBackground(.hidden)
            .background(AppTheme.Colors.appBackground)
            .navigationTitle(order.productsLine)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Renunță") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvează") { Task { await save() } }
                        .disabled(isSaving || deliveryPoint.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .sensoryFeedback(.success, trigger: saved)
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        var request = UpdateOrderRequest()
        request.deliveryPoint = deliveryPoint.trimmingCharacters(in: .whitespaces)
        request.deliveryAddress = deliveryAddress
        request.notes = notes
        // An untouched deadline is not resent (keeps a date-only value date-only).
        if hasDueDate, dueDate != order.dueDate {
            request.dueDate = ISO8601DateFormatter().string(from: dueDate)
        }
        if await onSave(request) {
            saved += 1
            dismiss()
        }
    }
}

#Preview("EditOrderSheet") {
    if let order = OrderPreviewData.orders.first {
        EditOrderSheet(order: order) { _ in true }
    }
}
