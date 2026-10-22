import SwiftUI

struct YieldCaptureSheet: View {
    let targetQuantity: Double
    let unit: UnitType
    var productionLocationId: String? = nil
    var locations: [LocationResponse] = []
    let onConfirm: (Double, String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var yieldText = ""
    @State private var destinationLocationId: String?
    @FocusState private var isFocused: Bool

    private var yieldValue: Double? {
        RoFormat.parseDecimal(yieldText)
    }

    private var variance: Double? {
        guard let y = yieldValue else { return nil }
        return YieldVarianceBand.percent(actual: y, target: targetQuantity)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Cantitate țintă") {
                    LabeledContent("Țintă", value: "\(unit.formatQty(targetQuantity))")
                }

                Section("Randament real") {
                    HStack {
                        TextField("Cantitate", text: $yieldText)
                            .keyboardType(.decimalPad)
                            .focused($isFocused)
                        Text(unit.abbreviation)
                            .foregroundStyle(.secondary)
                    }
                }

                if let variance {
                    Section("Varianță") {
                        HStack {
                            Text(RoPercent.format(variance, signed: true))
                                .font(.title2.bold())
                                .foregroundStyle(YieldVarianceBand(percent: variance).color)
                            Spacer()
                            if let yieldValue {
                                Text("\((yieldValue - targetQuantity) >= 0 ? "+" : "")\(unit.formatQty(yieldValue - targetQuantity))")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if !locations.isEmpty {
                    Section {
                        OptionalChoiceChips(
                            options: locations.map(\.id),
                            title: { id in locations.first { $0.id == id }?.name ?? "" },
                            selection: $destinationLocationId,
                            accessibilityLabel: "Locație finalizare"
                        )
                    } header: {
                        Text("Locație finalizare")
                    } footer: {
                        if destinationLocationId != nil && destinationLocationId != productionLocationId {
                            Text("Diferă de locația de producție — se generează o foaie de drum (transfer).")
                        }
                    }
                }
            }
            .navigationTitle("Finalizează taskul")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Renunță") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Confirmă") {
                        if let y = yieldValue {
                            onConfirm(y, destinationLocationId)
                            dismiss()
                        }
                    }
                    .disabled(yieldValue == nil || (yieldValue ?? 0) <= 0)
                }
            }
            .onAppear {
                isFocused = true
                if destinationLocationId == nil { destinationLocationId = productionLocationId }
            }
        }
    }
}

#Preview {
    YieldCaptureSheet(targetQuantity: 10, unit: .KILOGRAME) { _, _ in }
}
