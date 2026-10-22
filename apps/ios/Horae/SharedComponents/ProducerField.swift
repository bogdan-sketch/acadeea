import SwiftUI

/// Camp de producator/distribuitor: dropdown cu producatorii deja folositi
/// pe materiile prime + optiunea "Alt producator..." care deschide freetext
/// (prima achizitie de la un producator nou).
struct ProducerField: View {
    @Binding var producer: String

    @State private var options: [String] = []
    @State private var useCustom = false

    var body: some View {
        Group {
            if options.isEmpty || useCustom {
                TextField("ex: Boromir", text: $producer)
            } else {
                Menu {
                    Button("Fara producator") { producer = "" }
                    ForEach(options, id: \.self) { name in
                        Button(name) { producer = name }
                    }
                    Divider()
                    Button("Alt producator...") {
                        producer = ""
                        useCustom = true
                    }
                } label: {
                    HStack {
                        Text(producer.isEmpty ? "Fara producator" : producer)
                            .foregroundStyle(producer.isEmpty ? .secondary : Color.primary)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .contentShape(Rectangle())
                }
            }
        }
        .task {
            var query = RawMaterialQuery()
            query.limit = 500
            let materials = (try? await StockService.shared.fetchRawMaterials(query: query))?.data ?? []
            let names = Set(materials.compactMap { $0.producer }).filter { !$0.isEmpty }
            options = names.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
            // Valoarea curenta nu e in lista → ramai pe freetext ca sa nu o ascundem.
            if !producer.isEmpty && !names.contains(producer) { useCustom = true }
        }
    }
}
