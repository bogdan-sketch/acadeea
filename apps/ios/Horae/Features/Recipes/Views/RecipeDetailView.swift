import SwiftUI

/// Rețetă — hero photo under a transparent bar, Fraunces name + meta, three
/// stat tiles (Cost / Preț / Marjă), Ingrediente with ×1/×2/×6/×12 scaling and
/// a stock column, Stoc pe locații, links, and a bottom bar with edit + print
/// + "Pornește producția".
struct RecipeDetailView: View {
    let recipeId: String
    @State private var viewModel: RecipeDetailViewModel
    @State private var scale: Double = 1

    @Environment(\.routeNavigator) private var navigator
    @Environment(\.horizontalSizeClass) private var sizeClass

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    init(recipeId: String) {
        self.recipeId = recipeId
        self._viewModel = State(initialValue: RecipeDetailViewModel(recipeId: recipeId))
    }

    var body: some View {
        Group {
            if let recipe = viewModel.recipe {
                recipeContent(recipe)
            } else if viewModel.isLoading {
                LoadingStateView()
            } else {
                EmptyStateView(
                    title: "Rețeta negăsită",
                    systemImage: "exclamationmark.triangle",
                    subtitle: "Rețeta nu mai există sau a fost ștearsă"
                )
            }
        }
        .background(AppTheme.Colors.appBackground.ignoresSafeArea())
        .navigationTitle(viewModel.recipe?.name ?? "Rețetă")
        .navigationBarTitleDisplayMode(.inline)
        // The hero sits under a transparent bar; the name is in the content.
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) { Text("").accessibilityHidden(true) }
            if permissions.can(.update, .Recipe) {
                ToolbarItem(placement: .primaryAction) { moreMenu }
            }
        }
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
    }

    /// Draft / archive actions (an action menu, not a filter).
    private var moreMenu: some View {
        Menu {
            Button {
                Task { await viewModel.toggleDraft() }
            } label: {
                if viewModel.recipe?.isDraft == true {
                    Label("Publică", systemImage: "paperplane")
                } else {
                    Label("Salvează ca schiță", systemImage: "tray.and.arrow.down")
                }
            }
            Button {
                Task { await viewModel.toggleArchived() }
            } label: {
                if viewModel.recipe?.isArchived == true {
                    Label("Reactivează rețeta", systemImage: "arrow.uturn.backward")
                } else {
                    Label("Arhivează rețeta", systemImage: "archivebox")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("Mai multe acțiuni")
        .help("Schiță / arhivare")
    }

    // MARK: - Content

    private func recipeContent(_ recipe: RecipeResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if RecipePhotos.enabled {
                    RecipePhotoHeader(
                        recipe: recipe,
                        canEdit: permissions.can(.update, .Recipe),
                        isUploading: viewModel.isUploadingPhoto,
                        onPicked: { await viewModel.uploadPhoto($0) },
                        onDelete: { await viewModel.deletePhoto() }
                    )
                }
                VStack(alignment: .leading, spacing: 10) {
                    if !RecipePhotos.enabled { RecipeTagRow(recipe: recipe) }
                    titleBlock(recipe)
                    statTiles(recipe)
                    RecipeIngredientsCard(recipe: recipe, scale: $scale)
                    if let availability = viewModel.availability {
                        RecipeLocationsCard(unit: recipe.unit, availability: availability)
                    }
                    linksCard(recipe)
                    if BrandingManager.shared.nutritionEnabled {
                        HCard { VStack(alignment: .leading, spacing: 8) { RecipeNutritionSection(recipeId: recipe.id) } }
                    }
                    Text("Creat \(recipe.createdAt.dottedDateTime) · actualizat \(recipe.updatedAt.dottedDateTime)")
                        .font(AppFont.body(11))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .padding(.horizontal, 4)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
            }
        }
        // The photo hero runs under the transparent bar; without it the
        // content starts below the bar.
        .ignoresSafeArea(edges: RecipePhotos.enabled ? .top : [])
        .refreshable { await Task { await viewModel.load() }.value }
        .safeAreaInset(edge: .bottom) { bottomBar(recipe) }
    }

    private func titleBlock(_ recipe: RecipeResponse) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(recipe.name)
                .font(AppFont.title(26))
                .tracking(-0.3)
                .foregroundStyle(AppTheme.Colors.label)
                .accessibilityAddTraits(.isHeader)
            Text(meta(recipe))
                .font(AppFont.body(12))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
        }
        .padding(.horizontal, 4)
        .padding(.top, 2)
    }

    private func meta(_ recipe: RecipeResponse) -> String {
        var parts = ["\(recipe.unit.humanizedString(recipe.yieldQuantity)) / șarjă"]
        if let months = recipe.shelfLifeMonths { parts.append("valabil \(months) \(months == 1 ? "lună" : "luni")") }
        parts.append("v\(recipe.version)")
        return parts.joined(separator: " · ")
    }

    // MARK: - Stat tiles

    @ViewBuilder
    private func statTiles(_ recipe: RecipeResponse) -> some View {
        HStack(spacing: 8) {
            if permissions.can(.read, .RecipeCost) {
                let cost = viewModel.cost
                RecipeStatTile(label: "Cost", value: cost?.totalCost.map(\.ronFormatted) ?? "—",
                               route: .recipeCost(id: recipe.id))
                RecipeStatTile(label: "Preț",
                               value: (cost?.sellingPrice ?? recipe.sellingPrice).map(\.ronFormatted) ?? "—",
                               route: .recipePricing(id: recipe.id))
                RecipeStatTile(label: "Marjă",
                               value: cost?.marginPercent.map { "\(Int($0.rounded())) %" } ?? "—",
                               valueTone: cost?.marginPercent.map(marginTone),
                               highlighted: true,
                               route: .recipePricing(id: recipe.id))
            } else {
                RecipeStatTile(label: "Preț", value: recipe.sellingPrice.map(\.ronFormatted) ?? "—")
                RecipeStatTile(label: "Stoc", value: recipe.stockCount.map { recipe.unit.humanizedString($0) } ?? "—")
                RecipeStatTile(label: "Rezervat", value: recipe.reservedCount.map { recipe.unit.humanizedString($0) } ?? "—")
            }
        }
    }

    private func marginTone(_ percent: Double) -> AppTheme.Status.Kind {
        percent >= 30 ? .ready : (percent >= 15 ? .warning : .danger)
    }

    // MARK: - Links

    private func linksCard(_ recipe: RecipeResponse) -> some View {
        VStack(spacing: 0) {
            linkRow("Istoric randament", systemImage: "chart.bar.xaxis", route: .recipeYieldHistory(id: recipe.id), first: true)
            linkRow("Istoric versiuni", systemImage: "clock.arrow.circlepath", route: .recipeVersionHistory(id: recipe.id))
            if permissions.can(.read, .RecipeCost) {
                linkRow("Cost producție", systemImage: "banknote", route: .recipeCost(id: recipe.id))
                linkRow("Preț & marjă", systemImage: "tag", route: .recipePricing(id: recipe.id))
            }
        }
        .background(AppTheme.Colors.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(AppTheme.Colors.border, lineWidth: 1))
    }

    private func linkRow(_ title: String, systemImage: String, route: Route, first: Bool = false) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .frame(width: 32, height: 32)
                    .background(AppTheme.Colors.primary.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityHidden(true)
                Text(title)
                    .font(AppFont.body(14, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .overlay(alignment: .top) {
                if !first { Rectangle().fill(AppTheme.Colors.border).frame(height: 1) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Bottom bar

    private func bottomBar(_ recipe: RecipeResponse) -> some View {
        HStack(spacing: 10) {
            if permissions.can(.update, .Recipe) {
                HIconButton("pencil", label: "Editează rețeta") { navigator.push(.recipeEdit(id: recipe.id)) }
            }
            HIconButton("printer", label: "Tipărește fișa rețetei") {
                HTMLPrinter.present(html: RecipePrintSheet.html(recipe, scale: scale), jobName: recipe.name)
            }
            if permissions.can(.read, .StockMovement) {
                HIconButton("point.3.connected.trianglepath.dotted", label: "Trasabilitate") {
                    navigator.push(.productTraceability(kind: .recipe, id: recipe.id, name: recipe.name))
                }
            }
            if permissions.can(.create, .Task) {
                Button {
                    navigator.push(.taskCreateFromRecipe(recipeId: recipe.id))
                } label: {
                    Label("Pornește producția", systemImage: "play")
                        .font(AppFont.body(15, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.onPrimary)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(AppTheme.Colors.primary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Pornește un task de producție din rețetă")
            } else {
                Spacer()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background {
            AppTheme.Colors.tabBar
                .overlay(alignment: .top) { Rectangle().fill(AppTheme.Colors.border).frame(height: 1) }
                .ignoresSafeArea(edges: .bottom)
        }
    }
}

// MARK: - Stat tile

/// Small stat tile (label over a Fraunces value); optional link + accent wash.
private struct RecipeStatTile: View {
    let label: String
    let value: String
    var valueTone: AppTheme.Status.Kind?
    var highlighted = false
    var route: Route?

    var body: some View {
        if let route {
            NavigationLink(value: route) { tile }.buttonStyle(.plain)
        } else {
            tile
        }
    }

    private var tile: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(AppFont.body(11))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            Text(value)
                .font(AppFont.display(17))
                .foregroundStyle(valueTone.map(AppTheme.Status.fg) ?? AppTheme.Colors.label)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(highlighted ? AppTheme.Colors.primary.opacity(0.1) : AppTheme.Colors.card,
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .strokeBorder(highlighted ? AppTheme.Colors.primary.opacity(0.25) : AppTheme.Colors.border, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

#Preview("Rețetă") {
    NavigationStack {
        RecipeDetailView(recipeId: "e4e1bb2c-aa24-4bd6-bc92-0f4edcd440a5")
    }
    .environment(AppSchemeStore.shared)
}
