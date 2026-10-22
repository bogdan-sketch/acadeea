import SwiftUI

/// Producție list card: name + Fraunces quantity, status/visibility pills,
/// progress (subtasks when it has any, otherwise the status stage), assignee
/// initials and the due time (red when overdue).
struct TaskCardView: View {
    let task: TaskResponse
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        // iPad grid cells get their chrome from `adaptiveCard()`.
        if sizeClass == .regular {
            content
        } else {
            HCard { content }
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(task.name)
                    .font(AppFont.body(16, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(QtyBadge.text(task.targetQuantity, unitRaw: task.targetUnit.rawValue))
                    .font(AppFont.display(22))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(1)
                    .layoutPriority(1)
            }
            pills
            HProgressBar(value: progress, tint: task.status.hColor)
            footer
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// Wraps onto a second line at large Dynamic Type instead of clipping.
    private var pills: some View {
        ChipFlowLayout(spacing: 6) {
            TaskStatusPill(status: task.status)
            if task.visibility == .ASSIGNED {
                NeutralPill(title: "doar alocații", systemImage: "lock.fill")
            }
            if task.hasSubtasks {
                NeutralPill(title: "\(task.subtaskProgress) subtaskuri", systemImage: "checklist")
            }
            if task.priority > 0 {
                NeutralPill(title: "P\(task.priority)", systemImage: "flag.fill")
                    .accessibilityLabel("Prioritate \(task.priority)")
            }
            if task.status == .IN_LUCRU, let startedAt = task.startedAt {
                TaskTimerView(startedAt: startedAt)
                    .font(AppFont.body(11, weight: .semibold))
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 8) {
            InitialsAvatar(name: task.assignedTo?.fullName)
            Text(task.assignedTo.map(shortName) ?? "Nealocat")
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .lineLimit(1)
            Spacer(minLength: 8)
            if let due = task.dueDate {
                Text(TaskDueText.text(due))
                    .foregroundStyle(isOverdue ? AppTheme.Status.fg(.danger) : AppTheme.Colors.secondaryLabel)
                    .fontWeight(isOverdue ? .bold : .regular)
            }
        }
        .font(AppFont.body(12))
    }

    private var progress: Double {
        guard task.hasSubtasks else { return task.status.hStageFraction }
        let done = task.subtasks.filter { $0.status == .FINALIZAT || $0.status == .ANULAT }.count
        return Double(done) / Double(task.subtasks.count)
    }

    private var isOverdue: Bool {
        guard let due = task.dueDate else { return false }
        return RoDate.isPastDeadline(due) && task.status != .FINALIZAT && task.status != .ANULAT
    }

    /// "Mihai R." — first name + initial of the last name.
    private func shortName(_ user: TaskUser) -> String {
        guard let initial = user.lastName.first else { return user.firstName }
        return "\(user.firstName) \(initial)."
    }
}

/// "azi 12:00", "mâine 09:30", "ieri 16:00", else "16 oct. 12:00".
enum TaskDueText {
    static func text(_ date: Date) -> String {
        let cal = RoDate.calendar
        // Date-only deadlines (local or UTC midnight) show the day only.
        let time = RoDate.meaningfulTime(date).map { " \($0)" } ?? ""
        let day = RoDate.calendarDay(date)
        if cal.isDateInToday(day) { return "azi\(time)" }
        if cal.isDateInTomorrow(day) { return "mâine\(time)" }
        if cal.isDateInYesterday(day) { return "ieri\(time)" }
        return "\(day.dayMonth)\(time)"
    }
}

/// List row that pushes the task (hidden link: no List chevron next to the
/// card) or, in "Selectează" mode, toggles the selection.
struct TaskCardRow: View {
    let task: TaskResponse
    let selection: BulkSelection
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        // The hidden-link trick only works inside a List (compact); the iPad
        // grid needs a real, visible NavigationLink.
        if selection.isActive || sizeClass == .regular {
            BulkSelectRow(id: task.id, selection: selection, route: .taskDetail(id: task.id)) {
                TaskCardView(task: task)
            }
        } else {
            ZStack {
                NavigationLink(value: Route.taskDetail(id: task.id)) { EmptyView() }
                    .opacity(0)
                TaskCardView(task: task)
            }
        }
    }
}
