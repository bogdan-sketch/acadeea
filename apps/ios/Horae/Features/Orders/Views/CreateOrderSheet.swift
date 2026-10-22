import SwiftUI

struct CreateOrderSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var deliveryPoint = ""
    @State private var deliveryAddress = ""
    @State private var notes = ""
    @State private var dueDate = Date().addingTimeInterval(86400)
    @State private var hasDueDate = false
    @State private var items: [OrderItemDraft] = []
    @State private var isSubmitting = false
    @State private var error: APIError?
    @State private var showRecipePicker = false
    @State private var showDiscardConfirm = false
    @State private var isPickup = false
    @State private var pickupLocationId: String?
    @State private var locations: [LocationResponse] = []

    let onCreated: (OrderResponse) -> Void

    /// Any entry beyond the untouched defaults counts as unsaved changes.
    /// `dueDate` only matters once `hasDueDate` is on.
    private var isDirty: Bool {
        !deliveryPoint.isEmpty
            || !deliveryAddress.isEmpty
            || !notes.isEmpty
            || hasDueDate
            || isPickup
            || !items.isEmpty
    }

    var body: some View {
        Form {
            Section {
                Picker("Mod de predare", selection: $isPickup) {
                    Text("Livrare").tag(false)
                    Text("Ridicare").tag(true)
                }
                .pickerStyle(.segmented)
                .accessibilityLabel("Mod de predare")

                if isPickup {
                    if locations.isEmpty {
                        Text("Nicio locație activă").foregroundStyle(.secondary)
                    } else {
                        OptionalChoiceChips(
                            options: locations.map(\.id),
                            title: { id in locations.first { $0.id == id }?.name ?? "" },
                            selection: $pickupLocationId,
                            accessibilityLabel: "Locație de ridicare"
                        )
                    }
                    TextField("Client / nume la ridicare", text: $deliveryPoint)
                } else {
                    TextField("Punct de livrare *", text: $deliveryPoint)
                    TextField("Adresă (opțional)", text: $deliveryAddress)
                }
                Toggle(isPickup ? "Termen ridicare" : "Termen livrare", isOn: $hasDueDate)
                if hasDueDate {
                    DatePicker("Data", selection: $dueDate, displayedComponents: [.date])
                        .environment(\.locale, RoDate.locale)
                        .environment(\.calendar, RoDate.calendar)
                }
            } header: {
                Text("Predare").tutorialAnchor(id: "orders.create.open")
            } footer: {
                if isPickup {
                    Text("Clientul ridică produsele din locația aleasă.")
                }
            }

            Section {
                ForEach($items) { $item in
                    VStack(spacing: AppTheme.Spacing.sm) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(item.recipeName)
                                    .font(.body)
                            }
                            Spacer()
                            Button(role: .destructive) {
                                items.removeAll { $0.id == item.id }
                            } label: {
                                Image(systemName: "trash")
                                    .font(.caption)
                                    .frame(width: 44, height: 44)
                                    .contentShape(Rectangle())
                            }
                            .accessibilityLabel("Șterge \(item.recipeName)")
                        }

                        TextField("Cantitate", value: $item.quantity, format: .number)
                            .keyboardType(.decimalPad)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 100)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        UnitSelector(unit: $item.unit, title: "Unitate")
                    }
                    .padding(.vertical, AppTheme.Spacing.xs)
                }

                Button {
                    showRecipePicker = true
                } label: {
                    HStack {
                        Image(systemName: "plus.circle")
                            .foregroundStyle(AppTheme.Colors.primaryText)
                        Text("Adaugă produs")
                            .foregroundStyle(Color.primary)
                    }
                }

                if items.isEmpty {
                    Text("Adaugă cel puțin un produs")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text("Produse").tutorialAnchor(id: "orders.create.items")
            }

            Section {
                TextField("Note (opțional)", text: $notes, axis: .vertical)
                    .lineLimit(3...6)
            }
        }
        .navigationTitle("Comandă nouă")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    if isDirty { showDiscardConfirm = true } else { dismiss() }
                } label: {
                    Image(systemName: "xmark")
                }
                .accessibilityLabel("Renunță")
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Creează") { Task { await submit() } }
                    .disabled(!canSubmit)
            }
        }
        .unsavedChangesGuard(isDirty: isDirty, isPresented: $showDiscardConfirm) {
            dismiss()
        }
        .sheet(isPresented: $showRecipePicker) {
            NavigationStack {
                OrderRecipePickerView { recipeId, recipeName, unit in
                    items.append(OrderItemDraft(
                        recipeId: recipeId,
                        recipeName: recipeName,
                        quantity: 1,
                        unit: unit
                    ))
                    showRecipePicker = false
                } onCancel: {
                    showRecipePicker = false
                }
            }
        }
        .errorAlert($error)
        .task { await loadLocations() }
    }

    /// Delivery needs a delivery point; pickup needs a location (the point
    /// falls back to the location name, the API requires one).
    private var canSubmit: Bool {
        guard !items.isEmpty, !isSubmitting else { return false }
        return isPickup ? pickupLocationId != nil : !deliveryPoint.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func loadLocations() async {
        guard locations.isEmpty else { return }
        let all = (try? await LocationService.shared.fetchLocations()) ?? []
        locations = all.filter(\.isActive)
    }

    private func submit() async {
        isSubmitting = true
        defer { isSubmitting = false }

        let point = deliveryPoint.trimmingCharacters(in: .whitespaces)
        let pickupName = locations.first { $0.id == pickupLocationId }?.name
        let request = CreateOrderRequest(
            deliveryPoint: point.isEmpty ? (pickupName ?? "Ridicare") : point,
            fulfillmentType: isPickup ? .PICKUP : nil,
            pickupLocationId: isPickup ? pickupLocationId : nil,
            deliveryAddress: isPickup || deliveryAddress.isEmpty ? nil : deliveryAddress,
            notes: notes.isEmpty ? nil : notes,
            // Date-only deadline: local midnight reads as "no time" everywhere.
            dueDate: hasDueDate ? ISO8601DateFormatter().string(from: RoDate.calendarDay(dueDate)) : nil,
            items: items.map { item in
                CreateOrderItemRequest(
                    recipeId: item.recipeId,
                    quantity: item.quantity,
                    unit: item.unit
                )
            }
        )

        do {
            let order = try await OrderService.shared.createOrder(request)
            onCreated(order)
            dismiss()
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.networkError(error)
        }
    }
}

/// Draft model for items being added to a new order.
struct OrderItemDraft: Identifiable {
    let id = UUID()
    let recipeId: String
    let recipeName: String
    var quantity: Double
    var unit: UnitType
}

// MARK: - Recipe Picker for Orders (FINAL only)

struct OrderRecipePickerView: View {
    let onSelect: (String, String, UnitType) -> Void
    let onCancel: () -> Void

    @State private var searchText = ""
    @State private var recipes: [RecipeSummary] = []
    @State private var isLoading = false

    var body: some View {
        List {
            ForEach(recipes.filter { $0.type == .FINAL }) { recipe in
                Button {
                    onSelect(recipe.id, recipe.name, recipe.unit)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(recipe.name)
                                .font(.body)
                                .foregroundStyle(.primary)
                            Text(recipe.unit.abbreviation)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "plus.circle")
                            .foregroundStyle(.tint)
                    }
                    // .plain pe List limiteaza tap-ul la continutul desenat.
                    .contentShape(Rectangle())
                }
            }
        }
        .buttonStyle(.plain) // listele nu tinteaza textul randurilor
        .overlay {
            if isLoading && recipes.isEmpty {
                ProgressView()
            } else if !isLoading && recipes.filter({ $0.type == .FINAL }).isEmpty && !searchText.isEmpty {
                ContentUnavailableView("Nicio rețetă găsită", systemImage: "magnifyingglass")
            }
        }
        .navigationTitle("Selectează produsul")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .searchable(text: $searchText, prompt: "Caută rețeta…")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { onCancel() } label: { Image(systemName: "xmark") }
                    .accessibilityLabel("Închide")
            }
        }
        .task { await search() }
        .onChange(of: searchText) {
            Task { await search() }
        }
    }

    private func search() async {
        isLoading = true
        defer { isLoading = false }
        do {
            recipes = try await RecipeService.shared.searchRecipes(name: searchText)
        } catch {
            recipes = []
        }
    }
}

#Preview("CreateOrderSheet") {
    NavigationStack {
        CreateOrderSheet { _ in }
    }
}
