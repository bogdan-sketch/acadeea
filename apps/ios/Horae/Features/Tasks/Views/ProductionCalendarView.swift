import SwiftUI

/// Calendar — redesign: Zi / Săptămână chips (opens on Zi, today), a
/// "Săptămâna N" eyebrow + Fraunces day or week range with ‹ › icon buttons,
/// a Monday → Sunday day strip with layer dots, layer chips
/// (Comenzi / Producție / Expirări), then the selected day's events with an
/// "Urmează" preview (Zi) or every busy day of the week (Săptămână).
struct ProductionCalendarView: View {
    @State private var viewModel = ProductionCalendarViewModel()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Collapsing head — hidden while the calendar scrolls down.
    @State private var headVisible = true

    var body: some View {
        // Collapsing head (day/week title + arrows) over the pinned pill rows
        // (Zi / Săptămână, layers); only the calendar scrolls and refreshes.
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.bottom, 12)
                .autoCollapsible(headVisible)

            VStack(alignment: .leading, spacing: 8) {
                modeChips
                if viewModel.availableLayers.count > 1 {
                    layerChips
                }
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.top, headVisible ? 0 : 8)
            .padding(.bottom, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    CalendarWeekStrip(viewModel: viewModel)
                        .tutorialAnchor(id: "calendar.myDay.calendar")
                    switch viewModel.mode {
                    case .day: dayList
                    case .week: weekList
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.top, 2)
                .padding(.bottom, AppTheme.Spacing.xl)
            }
            .refreshable { await Task { await viewModel.load() }.value }
            .autoHideOnScroll($headVisible)
        }
        .appScreenBackground(showsGradient: false)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: viewModel.weekKey) {
            Task { await viewModel.load() }
        }
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
        .sensoryFeedback(.selection, trigger: viewModel.selectedDate)
    }

    // MARK: - Header

    private var eyebrow: String {
        let orders = RoCount.format(viewModel.totalOrders, one: "comandă", many: "comenzi")
        let tasks = RoCount.format(viewModel.totalTasks, one: "task", many: "taskuri")
        let counts = viewModel.availableLayers.contains(.orders) ? "\(orders), \(tasks)" : tasks
        return "Săptămâna \(viewModel.weekNumber) · \(counts)"
    }

    private var isDay: Bool { viewModel.mode == .day }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 8) {
            HScreenTitle(
                isDay ? RoDate.shortDay(viewModel.selectedDate) : RoDate.weekRange(viewModel.weekDays),
                eyebrow: eyebrow)
            if isDay ? !viewModel.selectedIsToday : !viewModel.weekContainsToday {
                HChip("Azi", isSelected: false) { withAnimation(animation) { viewModel.goToday() } }
                    .padding(.bottom, 4)
            }
            HIconButton("chevron.left", label: isDay ? "Ziua anterioară" : "Săptămâna trecută") {
                withAnimation(animation) { viewModel.navigate(-1) }
            }
            HIconButton("chevron.right", label: isDay ? "Ziua următoare" : "Săptămâna viitoare") {
                withAnimation(animation) { viewModel.navigate(1) }
            }
        }
    }

    // MARK: - Mode

    private var modeChips: some View {
        HStack(spacing: 6) {
            ForEach(ProductionCalendarViewModel.Mode.allCases) { mode in
                HChip(mode.title, isSelected: viewModel.mode == mode) {
                    withAnimation(animation) { viewModel.mode = mode }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Vizualizare")
    }

    private var animation: Animation? { reduceMotion ? nil : .snappy }

    // MARK: - Layers

    private var layerChips: some View {
        HStack(spacing: 6) {
            ForEach(viewModel.availableLayers) { layer in
                CalendarLayerChip(layer: layer, isOn: viewModel.activeLayers.contains(layer)) {
                    withAnimation(animation) { viewModel.toggle(layer) }
                }
            }
        }
    }

    // MARK: - Day list

    @ViewBuilder
    private var dayList: some View {
        let events = viewModel.events(on: viewModel.selectedDate)
        VStack(alignment: .leading, spacing: 8) {
            HSectionHeader(RoCount.format(events.count, one: "eveniment", many: "evenimente"))
            if viewModel.isLoading && events.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24)
            } else if events.isEmpty {
                HCard {
                    Text("Nimic programat în această zi")
                        .font(AppFont.body(13))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            } else {
                ForEach(events) { CalendarEventRow(event: $0) }
            }
        }
        if let next = viewModel.nextBusyDay {
            VStack(alignment: .leading, spacing: 8) {
                HSectionHeader("Urmează · \(RoDate.longDay(next))")
                ForEach(viewModel.events(on: next).prefix(4)) { event in
                    CalendarEventRow(event: event).opacity(0.75)
                }
            }
            .padding(.top, 4)
        }
    }
}

// MARK: - Week list

private extension ProductionCalendarView {
    @ViewBuilder
    var weekList: some View {
        let days = viewModel.busyDays
        if viewModel.isLoading && days.isEmpty {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24)
        } else if days.isEmpty {
            HCard {
                Text("Nimic programat în această săptămână")
                    .font(AppFont.body(13))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
        } else {
            ForEach(days, id: \.self) { day in
                let events = viewModel.events(on: day)
                VStack(alignment: .leading, spacing: 8) {
                    HSectionHeader("\(RoDate.longDay(day)) · \(RoCount.format(events.count, one: "eveniment", many: "evenimente"))")
                    ForEach(events) { CalendarEventRow(event: $0) }
                }
            }
        }
    }
}

// MARK: - Week strip

private struct CalendarWeekStrip: View {
    let viewModel: ProductionCalendarViewModel

    var body: some View {
        HStack(spacing: 5) {
            ForEach(Array(viewModel.weekDays.enumerated()), id: \.offset) { index, day in
                dayTile(index: index, day: day)
            }
        }
    }

    private func dayTile(index: Int, day: Date) -> some View {
        let cal = RoDate.calendar
        let isSelected = cal.isDate(day, inSameDayAs: viewModel.selectedDate)
        let isToday = cal.isDateInToday(day)
        let layers = viewModel.layers(on: day)
        let ink = isSelected ? AppTheme.Colors.onPrimary : AppTheme.Colors.label
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        return Button {
            viewModel.select(day)
        } label: {
            VStack(spacing: 3) {
                Text(RoDate.weekdayInitials[index])
                    .font(AppFont.body(10, weight: .bold))
                    .foregroundStyle(isSelected ? ink.opacity(0.85) : AppTheme.Colors.secondaryLabel)
                Text(RoDate.day(day))
                    .font(AppFont.display(20))
                    .foregroundStyle(isToday && !isSelected ? AppTheme.Colors.primaryText : ink)
                HStack(spacing: 2) {
                    ForEach(layers) { layer in
                        Circle()
                            .fill(isSelected ? AppTheme.Colors.onPrimary : AppTheme.Status.fg(layer.kind))
                            .frame(width: 5, height: 5)
                    }
                }
                .frame(height: 5)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(isSelected ? AppTheme.Colors.primary : AppTheme.Colors.card, in: shape)
            .overlay(shape.strokeBorder(
                isSelected ? AppTheme.Colors.primary : AppTheme.Colors.border, lineWidth: 1))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel(day: day, layers: layers, isToday: isToday))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func accessibilityLabel(day: Date, layers: [CalendarEvent.Layer], isToday: Bool) -> String {
        var parts = [RoDate.longDay(day)]
        if isToday { parts.append("azi") }
        if !layers.isEmpty { parts.append(layers.map(\.title).joined(separator: ", ")) }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Layer chip

/// Outlined toggle chip with the layer's dot; off = faded.
private struct CalendarLayerChip: View {
    let layer: CalendarEvent.Layer
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Circle()
                    .fill(AppTheme.Status.fg(layer.kind))
                    .frame(width: 8, height: 8)
                Text(layer.title)
                    .font(AppFont.body(13, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(AppTheme.Colors.label)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(AppTheme.Colors.card, in: Capsule())
            .overlay(Capsule().strokeBorder(
                isOn ? AppTheme.Colors.label : AppTheme.Colors.border, lineWidth: isOn ? 1.2 : 1))
            .opacity(isOn ? 1 : 0.5)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(layer.title)
        .accessibilityValue(isOn ? "afișat" : "ascuns")
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

// MARK: - Event row

private struct CalendarEventRow: View {
    let event: CalendarEvent

    var body: some View {
        if let route = event.route {
            NavigationLink(value: route) { content }
                .buttonStyle(.plain)
        } else {
            content
        }
    }

    private var content: some View {
        let tint = AppTheme.Status.fg(event.layer.kind)
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        return HStack(spacing: 12) {
            Text(event.time.flatMap(RoDate.meaningfulTime) ?? "—")
                .font(AppFont.display(17))
                .monospacedDigit()
                .frame(minWidth: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(AppFont.body(13, weight: .semibold))
                    .lineLimit(2)
                Text([event.subtitle, event.layer.title].compactMap { $0 }.joined(separator: " · "))
                    .font(AppFont.body(11))
                    .lineLimit(1)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        // Ink text for contrast; the accent bar + wash carry the layer colour.
        .foregroundStyle(AppTheme.Colors.label)
        .padding(.vertical, 12)
        .padding(.trailing, 12)
        .padding(.leading, 6)
        .background {
            ZStack(alignment: .leading) {
                AppTheme.Colors.card
                tint.opacity(0.12)
                Rectangle().fill(tint).frame(width: 3)
            }
            .clipShape(shape)
        }
        .contentShape(shape)
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    NavigationStack {
        ProductionCalendarView()
    }
}
