import SwiftUI

struct ConsumableDetailView: View {
    let consumableId: String
    @State private var consumable: ConsumableResponse?
    @State private var categories: [String] = []
    @State private var editCategory: String?
    @State private var isLoading = false
    @State private var showReceive = false
    @State private var showAdjust = false
    @State private var showCategorySheet = false
    @State private var error: APIError?

    private var canUpdate: Bool { AuthManager.shared.permissionManager.can(.update, .Consumable) }

    var body: some View {
        Group {
            if let consumable {
                consumableContent(consumable)
            } else if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView(
                    "Consumabilul nu a fost găsit",
                    systemImage: "exclamationmark.triangle",
                    description: Text("Poate a fost șters. Întoarce-te la Stoc și reîncarcă lista.")
                )
            }
        }
        .appScreenBackground(showsGradient: false)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showCategorySheet) {
            StockChipPickerSheet(
                title: "Categorie",
                options: categories.map { StockChoice(id: $0, title: $0) },
                selection: editCategory,
                noneTitle: StockText.noCategory
            ) { setCategory($0) }
        }
        .sheet(isPresented: $showReceive, onDismiss: { Task { await load() } }) {
            movementSheet(initialType: .INTRARE)
        }
        .sheet(isPresented: $showAdjust, onDismiss: { Task { await load() } }) {
            movementSheet(initialType: .AJUSTARE)
        }
        .task { await load() }
        .errorAlert($error)
    }

    private var canCreateMovement: Bool {
        AuthManager.shared.permissionManager.can(.create, .StockMovement)
    }

    @ViewBuilder
    private func movementSheet(initialType: StockMovementType) -> some View {
        if let consumable {
            NavigationStack {
                StockMovementFormView(
                    preselectedItem: StockMovementItemPreselection(
                        rawMaterialId: nil,
                        consumableId: consumable.id,
                        title: consumable.title,
                        unit: .BUCATI,
                        currentStock: Double(consumable.stockCount)
                    ),
                    lockItem: true,
                    initialType: initialType
                )
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            consumable = try await StockService.shared.fetchConsumable(id: consumableId)
            editCategory = consumable?.category
            categories = (try? await RecipeService.shared.fetchCategories(kind: "MATERIE_PRIMA")) ?? []
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    private func setCategory(_ cat: String?) {
        editCategory = cat
        Task {
            do {
                consumable = try await StockService.shared.updateConsumableCategory(id: consumableId, category: cat)
            } catch let err as APIError {
                error = err
            } catch {
                self.error = .networkError(error)
            }
        }
    }

    // MARK: - Content

    private func consumableContent(_ c: ConsumableResponse) -> some View {
        let unit = UnitType.BUCATI
        return ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                StockDetailHeader(
                    eyebrow: "Consumabil",
                    title: c.title,
                    status: c.status,
                    category: editCategory,
                    meta: c.minimumStock > 0 ? "prag minim \(unit.stockDisplay(c.minimumStock))" : nil,
                    onCategoryTap: canUpdate ? { showCategorySheet = true } : nil
                )
                if canCreateMovement { actions }
                StockLevelsCard(levels: levels(c, unit: unit))
                HCard {
                    VStack(alignment: .leading, spacing: 8) {
                        StockCardTitle("Informații")
                        StockInfoRow("Unitate", unit.abbreviation)
                        StockDivider()
                        // Configuration, not live stock.
                        StockInfoRow("Stoc minim", unit.stockDisplay(c.minimumStock))
                    }
                }
                StockTimestampsFooter(createdAt: c.createdAt, updatedAt: c.updatedAt)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 24)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await Task { await load() }.value }
    }

    private var actions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                HQuickActionChip("Recepție", systemImage: "arrow.down", help: "Înregistrează o intrare pentru acest consumabil") {
                    showReceive = true
                }
                HQuickActionChip("Ajustare", systemImage: "slider.horizontal.3", help: "Corectează stocul la valoarea reală") {
                    showAdjust = true
                }
                if AuthManager.shared.permissionManager.can(.read, .StockMovement) {
                    HQuickActionChip(
                        "Trasabilitate", systemImage: "point.3.connected.trianglepath.dotted",
                        help: "Toate taskurile care au folosit acest consumabil",
                        destination: .productTraceability(
                            kind: .consumable, id: consumableId, name: consumable?.title ?? "Consumabil"))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
        }
        // Bleed to the screen edges so the strip scrolls under the gutter.
        .padding(.horizontal, -16)
    }

    /// "În stoc" always (even 0); the rest only when non-zero.
    private func levels(_ c: ConsumableResponse, unit: UnitType) -> [StockLevel] {
        let lowStock = c.minimumStock > 0 && c.stockCount <= c.minimumStock
        var list = [StockLevel(
            label: "În stoc", value: unit.stockDisplay(c.stockCount),
            tone: c.stockCount <= 0 ? .danger : (lowStock ? .warning : nil))]
        if c.reservedCount > 0 {
            list.append(StockLevel(label: "Disponibil", value: unit.stockDisplay(c.stockCount - c.reservedCount)))
            list.append(StockLevel(label: "Rezervat", value: unit.stockDisplay(c.reservedCount), tone: .warning))
        }
        if c.orderedCount > 0 {
            list.append(StockLevel(label: "Comandate", value: unit.stockDisplay(c.orderedCount)))
        }
        return list
    }
}

#Preview("Consumabil") {
    NavigationStack {
        ConsumableDetailView(consumableId: "preview")
    }
}
