import SwiftUI

struct TaskBoardView: View {
    @Binding var searchText: String
    @State private var viewModel = TaskBoardViewModel()
    @State private var showYieldSheet = false
    @State private var showCancelAlert = false
    @State private var pendingTaskId: String?
    @State private var cancelReason = ""
    @State private var draggingTaskId: String?
    @State private var highlightedStatus: TaskStatus?
    @State private var hasAppearedOnce = false

    var body: some View {
        boardContent
        .task { await viewModel.load() }
        .onAppear {
            // Ca pe lista: la revenirea din formular boardul trebuie sa arate
            // taskurile noi — .task ruleaza doar la prima aparitie.
            guard hasAppearedOnce else { hasAppearedOnce = true; return }
            Task { await viewModel.load() }
        }
        .refreshable { await Task { await viewModel.load() }.value }
        .onChange(of: searchText) { viewModel.searchText = searchText }
        .errorAlert($viewModel.error)
        .alert("Motiv anulare", isPresented: $showCancelAlert) {
            TextField("Motiv", text: $cancelReason)
            Button("Anuleaza task") {
                if let id = pendingTaskId {
                    Task { await viewModel.moveTask(id, to: .ANULAT, reason: cancelReason) }
                }
                pendingTaskId = nil
            }
            Button("Renunta", role: .cancel) {
                pendingTaskId = nil
            }
        }
        .sheet(isPresented: $showYieldSheet) {
            if let id = pendingTaskId,
               let task = viewModel.allTasks.first(where: { $0.id == id }) {
                YieldCaptureSheet(
                    targetQuantity: task.targetQuantity,
                    unit: task.targetUnit
                ) { actualYield, _ in
                    // Board quick-finalize lands at the production location; choose a
                    // different destination from the task detail screen.
                    Task { await viewModel.moveTask(id, to: .FINALIZAT, actualYield: actualYield) }
                    pendingTaskId = nil
                }
            }
        }
    }

    // MARK: - Board

    private var boardContent: some View {
        VStack(spacing: 0) {
            // Cautarea vine din bara (collapsedSearch), ca pe lista.

            // "Ziua mea" — doar taskurile mele relevante azi.
            HStack {
                Button {
                    viewModel.myDayOnly.toggle()
                } label: {
                    Label("Ziua mea", systemImage: viewModel.myDayOnly ? "person.fill.checkmark" : "person")
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(viewModel.myDayOnly ? AppTheme.Colors.primary : AppTheme.Colors.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(
                            viewModel.myDayOnly ? AppTheme.Colors.primary : AppTheme.Colors.border, lineWidth: 1))
                        .foregroundStyle(viewModel.myDayOnly ? AppTheme.Colors.onPrimary : AppTheme.Colors.label)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ziua mea")
                .accessibilityAddTraits(viewModel.myDayOnly ? .isSelected : [])
                .tutorialAnchor(id: "calendar.myDay.filter")
                Spacer()
            }
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.bottom, AppTheme.Spacing.sm)

            // Columns — fixed 200pt on iPhone (scroll sideways); on iPad they
            // grow to share the full width, so all five sit side by side.
            GeometryReader { geo in
                let columnWidth = Self.columnWidth(available: geo.size.width)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                        ForEach(TaskBoardViewModel.columnOrder) { status in
                            boardColumn(status: status, width: columnWidth)
                        }
                    }
                    .padding(.horizontal, AppTheme.Spacing.md)
                }
            }
            .frame(maxHeight: .infinity)
        }
    }

    /// Column width for the available board width: at least 200pt, at most
    /// 360pt, otherwise an equal share so the columns fill the screen.
    static func columnWidth(available: CGFloat) -> CGFloat {
        let count = CGFloat(TaskBoardViewModel.columnOrder.count)
        let usable = available - 2 * AppTheme.Spacing.md - (count - 1) * AppTheme.Spacing.sm
        let share = usable / count
        return min(max(share, 200), 360)
    }

    // MARK: - Column

    private func boardColumn(status: TaskStatus, width: CGFloat) -> some View {
        let tasks = viewModel.tasksByStatus[status] ?? []
        let isDropTarget = highlightedStatus == status
        let canReceiveDrop = draggingTaskId.flatMap { viewModel.canTransition(taskId: $0, to: status) } ?? false

        return VStack(spacing: 0) {
            // Header
            HStack {
                Circle()
                    .fill(status.hColor)
                    .frame(width: 8, height: 8)
                    .accessibilityHidden(true)
                Text(status.displayName)
                    .font(AppFont.body(14, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.label)
                Spacer()
                Text("\(tasks.count)")
                    .font(AppFont.body(12, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(AppTheme.Colors.border.opacity(0.7), in: Capsule())
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.vertical, AppTheme.Spacing.sm)
            .background(AppTheme.Colors.card)

            Rectangle().fill(AppTheme.Colors.border).frame(height: 1)

            // Cards
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: AppTheme.Spacing.sm) {
                    ForEach(tasks) { task in
                        // Typed Route push (NOT navigationDestination(item:)):
                        // an item-bound destination pops the whole stack when the
                        // board re-renders while Editare is pushed on top of the
                        // detail — started tasks looked uneditable from the board.
                        NavigationLink(value: Route.taskDetail(id: task.id)) {
                            boardCard(task: task)
                        }
                        .buttonStyle(.plain)
                        .opacity(draggingTaskId == task.id ? 0.4 : 1.0)
                        .onDrag {
                            draggingTaskId = task.id
                            return NSItemProvider(object: task.id as NSString)
                        } preview: {
                            boardCardPreview(task: task)
                        }
                    }
                }
                .padding(AppTheme.Spacing.sm)
            }
        }
        .frame(width: width)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md)
                .fill(AppTheme.Colors.appBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md)
                .stroke(
                    isDropTarget && canReceiveDrop ? AppTheme.Colors.primary :
                    isDropTarget && !canReceiveDrop ? AppTheme.Status.fg(.danger).opacity(0.5) :
                    Color.clear,
                    lineWidth: 2
                )
        )
        .dropDestination(for: String.self) { droppedIds, _ in
            highlightedStatus = nil
            draggingTaskId = nil
            guard let taskId = droppedIds.first else { return false }
            return handleDrop(taskId: taskId, to: status)
        } isTargeted: { isTargeted in
            withAnimation(.easeInOut(duration: 0.15)) {
                highlightedStatus = isTargeted ? status : nil
            }
        }
    }

    // MARK: - Card

    private func boardCard(task: TaskResponse) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text(task.displayName)
                .font(.subheadline.weight(.medium))
                .lineLimit(2)

            // Familia (batch) din care face parte taskul, cand exista.
            TaskGroupBadge(label: task.groupLabel)
                .tutorialAnchor(id: "tasks.multi.group")

            HStack(spacing: AppTheme.Spacing.xs) {
                if let assignee = task.assignedTo {
                    initialsCircle(assignee)
                    Text(assignee.firstName)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                if task.status == .IN_LUCRU, let startedAt = task.startedAt {
                    TaskTimerView(startedAt: startedAt)
                }
            }

            // Shortage info for BLOCAT tasks
            if task.status == .BLOCAT, let shortages = task.shortages, !shortages.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(shortages.prefix(3)) { s in
                        Text("\(s.displayTitle): lipsesc \(UnitType.formatQty(s.shortage, unitRaw: s.unit))")
                            .font(.caption2)
                            .foregroundStyle(AppTheme.Status.fg(.warning))
                            .lineLimit(1)
                    }
                }
            }

            HStack(spacing: AppTheme.Spacing.xs) {
                PriorityBadge(priority: task.priority)

                if let dueDate = task.dueDate {
                    let overdue = RoDate.isPastDeadline(dueDate) && !task.status.isClosed
                    Image(systemName: "calendar")
                        .font(.caption2)
                        .foregroundStyle(overdue ? AppTheme.Status.fg(.danger) : AppTheme.Colors.secondaryLabel)
                        .accessibilityHidden(true)
                    Text(TaskDueText.text(dueDate))
                        .font(.caption2)
                        .fontWeight(overdue ? .bold : .regular)
                        .foregroundStyle(overdue ? AppTheme.Status.fg(.danger) : AppTheme.Colors.secondaryLabel)
                        .accessibilityLabel("Termen \(TaskDueText.text(dueDate))")
                }
            }
        }
        .padding(AppTheme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.Colors.card, in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.sm))
        .overlay(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.sm).strokeBorder(AppTheme.Colors.border, lineWidth: 1))
    }

    /// Drag preview shown while dragging.
    private func boardCardPreview(task: TaskResponse) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(task.displayName)
                .font(.subheadline.weight(.medium))
                .lineLimit(2)
        }
        .padding(AppTheme.Spacing.sm)
        .frame(width: 180)
        .background(AppTheme.Colors.card, in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.sm))
    }

    // MARK: - Helpers

    private func initialsCircle(_ user: TaskUser) -> some View {
        let initials = "\(user.firstName.prefix(1))\(user.lastName.prefix(1))"
        return Text(initials)
            .font(.caption2.bold())
            .foregroundStyle(.white)
            .frame(width: 20, height: 20)
            .background(AppTheme.Colors.primary, in: Circle())
            .accessibilityHidden(true)
    }

    private func handleDrop(taskId: String, to newStatus: TaskStatus) -> Bool {
        guard viewModel.canTransition(taskId: taskId, to: newStatus) else { return false }

        if newStatus == .FINALIZAT {
            pendingTaskId = taskId
            showYieldSheet = true
            return true
        }

        if newStatus == .ANULAT {
            pendingTaskId = taskId
            cancelReason = ""
            showCancelAlert = true
            return true
        }

        Task { await viewModel.moveTask(taskId, to: newStatus) }
        return true
    }
}
