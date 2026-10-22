import SwiftUI

// Cards of the redesigned task detail (TaskDetailView).

// MARK: - Title

struct TaskDetailTitle: View {
    let task: TaskResponse

    private var hasCustomTitle: Bool {
        (task.title?.trimmingCharacters(in: .whitespaces).isEmpty == false)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                TaskStatusPill(status: task.status)
                if let due = task.dueDate {
                    Text("Termen \(TaskDueText.text(due))")
                        .font(AppFont.body(12, weight: .semibold))
                        .foregroundStyle(isOverdue(due) ? AppTheme.Status.fg(.danger) : AppTheme.Colors.secondaryLabel)
                }
                if task.priority > 0 {
                    NeutralPill(title: "P\(task.priority)", systemImage: "flag.fill")
                        .accessibilityLabel("Prioritate \(task.priority)")
                }
            }
            (Text(task.name + " ")
                + Text(QtyBadge.text(task.targetQuantity, unitRaw: task.targetUnit.rawValue))
                    .foregroundColor(AppTheme.Colors.primaryText))
                .font(AppFont.title(26))
                .tracking(-0.3)
                .foregroundStyle(AppTheme.Colors.label)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 4) {
                // Custom name on top; the recipe stays one tap away.
                NavigationLink(value: Route.recipeDetail(id: task.recipeId)) {
                    HStack(spacing: 2) {
                        Text(hasCustomTitle ? "Rețetă: \(task.recipeName)" : "Vezi rețeta")
                        Image(systemName: "chevron.right").imageScale(.small)
                    }
                    .foregroundStyle(AppTheme.Colors.primaryText)
                }
                .buttonStyle(.plain)
                if let location = task.locationName {
                    Text("· \(location)")
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
                if let group = task.groupLabel {
                    Text("· \(group)")
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
            .font(AppFont.body(12, weight: .medium))
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func isOverdue(_ due: Date) -> Bool {
        RoDate.isPastDeadline(due) && task.status != .FINALIZAT && task.status != .ANULAT
    }
}

// MARK: - Status stepper

/// De făcut → În lucru → Finalizat. "Blocat" sits on the first step in amber;
/// "Anulat" greys the flow out with a danger note.
struct TaskStatusStepper: View {
    let status: TaskStatus

    private let steps: [TaskStatus] = [.DE_FACUT, .IN_LUCRU, .FINALIZAT]

    private var currentIndex: Int {
        switch status {
        case .DE_FACUT, .BLOCAT: 0
        case .IN_LUCRU: 1
        case .FINALIZAT: 2
        case .ANULAT: -1
        }
    }

    var body: some View {
        HCard(padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        stepView(index: index, step: step)
                        if index < steps.count - 1 {
                            Capsule()
                                .fill(index < currentIndex ? AppTheme.Status.fg(.ready) : AppTheme.Colors.border)
                                .frame(height: 2)
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
                if status == .ANULAT {
                    Text("Taskul a fost anulat")
                        .font(AppFont.body(12, weight: .semibold))
                        .foregroundStyle(AppTheme.Status.fg(.danger))
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Etapă: \(status.displayName)")
    }

    private func stepView(index: Int, step: TaskStatus) -> some View {
        let isDone = index < currentIndex
        let isCurrent = index == currentIndex
        let label = (isCurrent && status == .BLOCAT) ? TaskStatus.BLOCAT.displayName : step.displayName
        let tint: Color = {
            if isCurrent && status == .BLOCAT { return AppTheme.Status.fg(.warning) }
            if isCurrent { return step == .FINALIZAT ? AppTheme.Status.fg(.ready) : AppTheme.Status.fg(.inProgress) }
            if isDone { return AppTheme.Status.fg(.ready) }
            return AppTheme.Colors.secondaryLabel
        }()
        return HStack(spacing: 5) {
            ZStack {
                Circle()
                    .fill(isDone || isCurrent ? tint : .clear)
                    .overlay(Circle().strokeBorder(tint, lineWidth: isDone || isCurrent ? 0 : 1.5))
                if isDone {
                    Image(systemName: "checkmark")
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundStyle(.white)
                }
            }
            .frame(width: 16, height: 16)
            Text(label)
                .font(AppFont.body(12, weight: isCurrent ? .bold : .medium))
                .foregroundStyle(isCurrent ? tint : AppTheme.Colors.secondaryLabel)
                .lineLimit(1)
                .fixedSize()
        }
    }
}

// MARK: - Ingredients checklist

/// Scaled ingredients with a big prep checkbox per row. The ticks are a
/// device-local prep aid (per task, in UserDefaults) — they don't touch stock.
struct TaskIngredientsCard: View {
    let task: TaskResponse
    let requirements: [TaskMaterialRequirement]
    /// Closed task: the checklist is shown but cannot be ticked.
    var isReadOnly = false
    @State private var done: Set<String> = []

    private var storageKey: String { "task-prep-checklist-\(task.id)" }

    private func key(_ req: TaskMaterialRequirement) -> String {
        req.rawMaterialId ?? req.recipeId ?? req.title
    }

    private var missing: Int { requirements.filter { !$0.sufficient }.count }

    var body: some View {
        HListCard {
            CardHeader(
                title: "Ingrediente \(QtyBadge.text(task.targetQuantity, unitRaw: task.targetUnit.rawValue))",
                trailing: "\(done.count) / \(requirements.count)"
            )
            HProgressBar(
                value: requirements.isEmpty ? 0 : Double(done.count) / Double(requirements.count),
                tint: AppTheme.Status.fg(.ready)
            )
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
            ForEach(requirements) { req in
                CardDivider()
                row(req)
            }
            if missing > 0 && !isReadOnly {
                CardDivider()
                HStack(spacing: 6) {
                    NavigationLink(value: Route.shoppingList) {
                        Label(
                            "Lipsește \(RoCount.format(missing, one: "ingredient", many: "ingrediente"))",
                            systemImage: "cart"
                        )
                        .font(AppFont.body(12, weight: .bold))
                        .foregroundStyle(AppTheme.Status.fg(.warning))
                        .padding(.horizontal, 10)
                        .frame(minHeight: 30)
                        .background(AppTheme.Status.fg(.warning).opacity(0.14), in: Capsule())
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Deschide lista de cumpărături")
                    Spacer()
                }
                .padding(.horizontal, 14)
            }
        }
        .onAppear(perform: restore)
        .sensoryFeedback(.selection, trigger: done)
    }

    private func row(_ req: TaskMaterialRequirement) -> some View {
        let isDone = done.contains(key(req))
        return HStack(spacing: 12) {
            Button {
                toggle(req)
            } label: {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isDone ? AppTheme.Status.fg(.ready) : AppTheme.Colors.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .strokeBorder(isDone ? AppTheme.Status.fg(.ready) : AppTheme.Colors.border, lineWidth: 2)
                    )
                    .overlay {
                        if isDone {
                            Image(systemName: "checkmark")
                                .font(.system(size: 13, weight: .heavy))
                                .foregroundStyle(.white)
                        }
                    }
                    .frame(width: 26, height: 26)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isReadOnly)
            .opacity(isReadOnly && !isDone ? 0.5 : 1)
            .padding(.leading, -9)
            .padding(.vertical, -6)
            .accessibilityLabel(isDone ? "Pregătit: \(req.title)" : "Marchează pregătit: \(req.title)")
            .accessibilityAddTraits(isDone ? .isSelected : [])

            VStack(alignment: .leading, spacing: 1) {
                Text(req.title)
                    .font(AppFont.body(13, weight: .semibold))
                    .strikethrough(isDone)
                    .foregroundStyle(isDone ? AppTheme.Colors.secondaryLabel : AppTheme.Colors.label)
                    .lineLimit(1)
                Text(req.rawMaterialId != nil ? "Materie primă" : "Semipreparat")
                    .font(AppFont.body(11))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(req.display(req.needed))
                .font(AppFont.body(13, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
            Text(req.display(req.currentStock))
                .font(AppFont.body(11, weight: .bold))
                .foregroundStyle(req.sufficient ? AppTheme.Colors.secondaryLabel : AppTheme.Status.fg(.danger))
                .frame(minWidth: 56, alignment: .trailing)
                .accessibilityLabel(req.sufficient
                    ? "În stoc \(req.display(req.currentStock))"
                    : "Stoc insuficient: \(req.display(req.currentStock))")
        }
        .monospacedDigit()
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private func toggle(_ req: TaskMaterialRequirement) {
        let k = key(req)
        if done.contains(k) { done.remove(k) } else { done.insert(k) }
        UserDefaults.standard.set(Array(done), forKey: storageKey)
    }

    private func restore() {
        let saved = UserDefaults.standard.stringArray(forKey: storageKey) ?? []
        let valid = Set(requirements.map(key))
        done = Set(saved).intersection(valid)
    }
}

// MARK: - Shortages (Blocat)

struct TaskShortagesCard: View {
    let shortages: [TaskShortage]

    var body: some View {
        HListCard {
            HStack {
                Label("Lipsuri stoc", systemImage: "exclamationmark.triangle.fill")
                    .font(AppFont.body(15, weight: .bold))
                    .foregroundStyle(AppTheme.Status.fg(.warning))
                    .tutorialAnchor(id: "tasks.transitions.blocked")
                Spacer()
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 40)
            ForEach(shortages) { shortage in
                CardDivider()
                VStack(alignment: .leading, spacing: 2) {
                    Text(shortage.displayTitle)
                        .font(AppFont.body(13, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.label)
                    Text("Necesar \(UnitType.formatQty(shortage.needed, unitRaw: shortage.unit)) · Disponibil \(UnitType.formatQty(shortage.available, unitRaw: shortage.unit))")
                        .font(AppFont.body(11))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

// MARK: - People

struct TaskPeopleCard: View {
    let task: TaskResponse
    let canUpdate: Bool

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Cine lucrează")
                        .font(AppFont.body(15, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.label)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    if canUpdate {
                        NavigationLink(value: Route.taskEdit(id: task.id)) {
                            Image(systemName: "plus")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                                .frame(width: 32, height: 32)
                                .overlay(Circle().strokeBorder(
                                    AppTheme.Colors.border, style: StrokeStyle(lineWidth: 1, dash: [3])))
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .padding(.vertical, -8)
                        .accessibilityLabel("Alocă persoană")
                        .help("Alocă persoană la task")
                    }
                }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 14) { people }
                    VStack(alignment: .leading, spacing: 10) { people }
                }
            }
        }
    }

    @ViewBuilder
    private var people: some View {
        person(
            name: task.assignedTo?.fullName,
            fallback: "Nealocat",
            role: task.assignedTo == nil ? "fără persoană alocată"
                : task.startedAt.map { "de la \(RoDate.time($0))" } ?? "alocat"
        )
        ForEach(subtaskPeople, id: \.self) { name in
            person(name: name, fallback: name, role: "subtask")
        }
        person(name: task.createdBy.fullName, fallback: "", role: "a creat taskul")
    }

    /// People on subtasks other than the main assignee.
    private var subtaskPeople: [String] {
        Set(task.subtasks.compactMap { $0.assignedTo?.fullName })
            .subtracting([task.assignedTo?.fullName].compactMap { $0 })
            .sorted()
    }

    private func person(name: String?, fallback: String, role: String) -> some View {
        HStack(spacing: 8) {
            InitialsAvatar(name: name, size: 30)
            VStack(alignment: .leading, spacing: 0) {
                Text(name ?? fallback)
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                Text(role)
                    .font(AppFont.body(11))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Visibility

struct TaskVisibilityCard: View {
    let task: TaskResponse
    let canUpdate: Bool
    let select: (TaskVisibility) -> Void

    private func title(_ visibility: TaskVisibility) -> String { visibility.chipLabel }

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Cine vede taskul")
                    .font(AppFont.body(15, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .accessibilityAddTraits(.isHeader)
                if canUpdate {
                    ChipFlowLayout(spacing: 6) { chips }
                        .padding(.vertical, 2)
                } else {
                    // Read-only (no right or closed task): just the current setting.
                    let current = task.visibility ?? .ASSIGNED
                    NeutralPill(title: title(current), systemImage: current.icon)
                        .accessibilityLabel("Vizibilitate: \(title(current))")
                }
            }
        }
    }

    @ViewBuilder
    private var chips: some View {
        ForEach(TaskVisibility.allCases) { visibility in
            if visibility == .SELECTED && task.visibility != .SELECTED {
                // Picking the people needs the edit form.
                NavigationLink(value: Route.taskEdit(id: task.id)) {
                    chipLabel(title(visibility), isSelected: false)
                }
                .buttonStyle(.plain)
            } else {
                HChip(title(visibility), isSelected: task.visibility == visibility) {
                    if visibility != .SELECTED { select(visibility) }
                }
            }
        }
    }

    private func chipLabel(_ title: String, isSelected: Bool) -> some View {
        Text(title)
            .font(AppFont.body(13, weight: .semibold))
            .foregroundStyle(AppTheme.Colors.label)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(AppTheme.Colors.card, in: Capsule())
            .overlay(Capsule().strokeBorder(AppTheme.Colors.border, lineWidth: 1))
            .contentShape(.interaction, Rectangle().inset(by: -6))
    }
}

// MARK: - Details / times

struct TaskTimesCard: View {
    let task: TaskResponse

    var body: some View {
        HListCard {
            CardHeader(title: "Detalii")
            if let location = task.locationName { line("Locație", location) }
            if let planned = task.plannedDate { line("Planificat", stamp(planned)) }
            if let due = task.dueDate {
                line("Termen limită", stamp(due),
                     tint: RoDate.isPastDeadline(due) && task.status != .FINALIZAT && task.status != .ANULAT
                        ? AppTheme.Status.fg(.danger) : nil)
            }
            switch task.status {
            case .IN_LUCRU:
                if let startedAt = task.startedAt {
                    line("Început", stamp(startedAt))
                    CardDivider()
                    HStack {
                        Text("Timp scurs").foregroundStyle(AppTheme.Colors.secondaryLabel)
                        Spacer()
                        TaskTimerView(startedAt: startedAt)
                    }
                    .font(AppFont.body(13))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
            case .FINALIZAT:
                if let startedAt = task.startedAt { line("Început", stamp(startedAt)) }
                if let completedAt = task.completedAt { line("Finalizat", stamp(completedAt)) }
                if let startedAt = task.startedAt, let completedAt = task.completedAt {
                    line("Durată", duration(completedAt.timeIntervalSince(startedAt)))
                }
            case .ANULAT:
                if let cancelledAt = task.cancelledAt { line("Anulat", stamp(cancelledAt)) }
                if let reason = task.cancelReason?.trimmingCharacters(in: .whitespacesAndNewlines), !reason.isEmpty {
                    line("Motiv", reason, tint: AppTheme.Status.fg(.danger))
                }
            case .DE_FACUT, .BLOCAT:
                EmptyView()
            }
            if let notes = task.notes, !notes.isEmpty { line("Note", notes) }
        }
    }

    private func line(_ label: String, _ value: String, tint: Color? = nil) -> some View {
        VStack(spacing: 0) {
            CardDivider()
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(label)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                Spacer(minLength: 8)
                Text(value)
                    .foregroundStyle(tint ?? AppTheme.Colors.label)
                    .fontWeight(.semibold)
                    .multilineTextAlignment(.trailing)
            }
            .font(AppFont.body(13))
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .accessibilityElement(children: .combine)
        }
    }

    /// Date-only deadlines (00:00 local or UTC) print the day without a time.
    private func stamp(_ date: Date) -> String { RoDate.stamp(date) }

    private func duration(_ interval: TimeInterval) -> String {
        let total = max(0, Int(interval))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        return hours > 0 ? "\(hours) h \(minutes) min" : "\(minutes) min"
    }
}

// MARK: - Yield

struct TaskYieldCard: View {
    let task: TaskResponse
    let actualYield: Double

    private var variance: Double { task.variancePercent ?? 0 }

    private var tint: Color { YieldVarianceBand(percent: variance).color }

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Randament")
                    .font(AppFont.body(15, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.label)
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Țintă \(task.targetUnit.formatQty(task.targetQuantity))")
                        Text("Real \(task.targetUnit.formatQty(actualYield))")
                    }
                    .font(AppFont.body(13))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    Spacer()
                    if task.variancePercent != nil {
                        Text(RoPercent.format(variance, signed: true))
                            .font(AppFont.display(22))
                            .foregroundStyle(tint)
                    }
                }
                HProgressBar(value: min(actualYield / max(task.targetQuantity, 0.0001), 1.5) / 1.5, tint: tint)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Subtasks

struct TaskSubtasksCard: View {
    let task: TaskResponse

    var body: some View {
        HListCard {
            CardHeader(title: "Subtaskuri", trailing: task.subtaskProgress)
            ForEach(task.subtasks) { subtask in
                CardDivider()
                NavigationLink(value: Route.taskDetail(id: subtask.id)) {
                    HStack(spacing: 10) {
                        InitialsAvatar(name: subtask.assignedTo?.fullName, size: 26)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(subtask.displayName)
                                .font(AppFont.body(13, weight: .semibold))
                                .foregroundStyle(AppTheme.Colors.label)
                            Text(subtask.assignedTo?.fullName ?? "Nealocat")
                                .font(AppFont.body(11))
                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        }
                        .lineLimit(1)
                        Spacer()
                        TaskStatusPill(status: subtask.status)
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - History

struct TaskHistoryCard: View {
    let history: [TaskStatusHistory]
    @State private var expanded = false

    var body: some View {
        HCard {
            DisclosureGroup(isExpanded: $expanded) {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(history) { entry in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                if let from = entry.fromStatus {
                                    TaskStatusPill(status: from)
                                    Image(systemName: "arrow.right")
                                        .font(.caption2)
                                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                                }
                                TaskStatusPill(status: entry.toStatus)
                            }
                            Text("\(entry.changedBy.fullName) · \(RoDate.shortDay(entry.createdAt)), \(RoDate.time(entry.createdAt))")
                                .font(AppFont.body(11))
                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            if let reason = entry.reason {
                                Text(reason)
                                    .font(AppFont.body(11))
                                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.top, 10)
            } label: {
                HStack {
                    Text("Istoric status")
                        .font(AppFont.body(15, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.label)
                    Spacer()
                    Text(RoCount.format(history.count, one: "tranziție", many: "tranziții"))
                        .font(AppFont.body(12, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
            .tint(AppTheme.Colors.secondaryLabel)
        }
    }
}

// MARK: - Action buttons

/// Large label + icon of a transition.
enum TaskTransitionStyle {
    static func label(_ status: TaskStatus) -> String {
        switch status {
        case .IN_LUCRU: "Începe lucrul"
        case .FINALIZAT: "Finalizează"
        case .ANULAT: "Anulează taskul"
        case .DE_FACUT: "Înapoi la de făcut"
        case .BLOCAT: "Marchează blocat"
        }
    }

    static func icon(_ status: TaskStatus) -> String {
        switch status {
        case .IN_LUCRU: "play.fill"
        case .FINALIZAT: "checkmark"
        case .ANULAT: "xmark"
        case .DE_FACUT: "arrow.uturn.backward"
        case .BLOCAT: "exclamationmark.triangle"
        }
    }
}

/// 50×50 icon-only secondary action of the bottom bar.
struct TaskActionIconButton: View {
    let status: TaskStatus
    let disabled: Bool
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        Button(action: action) {
            Image(systemName: TaskTransitionStyle.icon(status))
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(status == .ANULAT ? AppTheme.Status.fg(.danger) : AppTheme.Colors.label)
                .frame(width: 50, height: 50)
                .background(AppTheme.Colors.appBackground, in: shape)
                .overlay(shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                .contentShape(shape)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityLabel(TaskTransitionStyle.label(status))
        .help(TaskTransitionStyle.label(status))
    }
}

/// Full-width primary CTA: blue to start, green to finish (fixed status palette).
struct TaskPrimaryActionButton: View {
    let status: TaskStatus
    let isWorking: Bool
    let action: () -> Void

    var body: some View {
        let fill = AppTheme.Status.fg(status == .FINALIZAT ? .ready : .inProgress)
        Button(action: action) {
            HStack(spacing: 8) {
                if isWorking {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: TaskTransitionStyle.icon(status))
                        .font(.system(size: 16, weight: .bold))
                }
                Text(TaskTransitionStyle.label(status))
                    .font(AppFont.body(15, weight: .bold))
            }
            // White on the fixed (dark-enough) status fills, on every scheme.
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isWorking)
    }
}
