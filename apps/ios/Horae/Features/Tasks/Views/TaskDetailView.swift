import SwiftUI

/// Task detail — redesign: status + due line, Fraunces title with the
/// quantity in the accent, status stepper, ingredient checklist, people and
/// visibility cards, details/history, and a bottom action bar (icon buttons
/// for the secondary transitions + one primary CTA).
struct TaskDetailView: View {
    let taskId: String
    @State private var viewModel: TaskDetailViewModel
    @State private var showCancelReasonAlert = false
    @State private var cancelReason = ""
    @State private var showYieldSheet = false
    @State private var transitionTrigger = 0

    init(taskId: String) {
        self.taskId = taskId
        self._viewModel = State(initialValue: TaskDetailViewModel(taskId: taskId))
    }

    var body: some View {
        Group {
            if let task = viewModel.task {
                taskContent(task)
            } else if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                EmptyStateView(title: "Task negăsit", systemImage: "exclamationmark.triangle")
            }
        }
        .appScreenBackground(showsGradient: false)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Closed tasks (Finalizat / Anulat) are read-only, as on the web.
            if viewModel.canUpdate, let task = viewModel.task, !task.status.isClosed {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink(value: Route.taskEdit(id: task.id)) {
                        Image(systemName: "pencil")
                    }
                    .accessibilityLabel("Editează taskul")
                    .help("Editează: cantitate, termen, alocați, vizibilitate")
                }
            }
        }
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
        .sensoryFeedback(.success, trigger: transitionTrigger)
        .alert("Motiv anulare", isPresented: $showCancelReasonAlert) {
            TextField("Motiv", text: $cancelReason)
            Button("Anulează taskul", role: .destructive) {
                Task { await transition(to: .ANULAT, reason: cancelReason) }
            }
            Button("Renunță", role: .cancel) {}
        }
        .sheet(isPresented: $showYieldSheet) {
            if let task = viewModel.task {
                YieldCaptureSheet(
                    targetQuantity: task.targetQuantity,
                    unit: task.targetUnit,
                    productionLocationId: task.locationId,
                    locations: viewModel.availableLocations
                ) { actualYield, outputLocationId in
                    Task {
                        await transition(to: .FINALIZAT, actualYield: actualYield, outputLocationId: outputLocationId)
                    }
                }
            }
        }
    }

    // MARK: - Content

    private func taskContent(_ task: TaskResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                TaskDetailTitle(task: task)
                    .padding(.horizontal, 4)
                    .padding(.bottom, 4)
                TaskStatusStepper(status: task.status)
                if !viewModel.materialRequirements.isEmpty {
                    TaskIngredientsCard(
                        task: task,
                        requirements: viewModel.materialRequirements,
                        isReadOnly: task.status.isClosed
                    )
                }
                if task.status == .BLOCAT, let shortages = task.shortages, !shortages.isEmpty {
                    TaskShortagesCard(shortages: shortages)
                }
                TaskPeopleCard(task: task, canUpdate: canEdit(task))
                TaskVisibilityCard(
                    task: task,
                    canUpdate: canEdit(task),
                    select: { visibility in Task { await viewModel.setVisibility(visibility) } }
                )
                TaskTimesCard(task: task)
                if task.status == .FINALIZAT, let actualYield = task.actualYield {
                    TaskYieldCard(task: task, actualYield: actualYield)
                }
                if task.status == .FINALIZAT {
                    NavigationLink {
                        TaskTraceabilityView(taskId: task.id)
                    } label: {
                        HCard {
                            HStack {
                                Label("Fișa de trasabilitate", systemImage: "doc.text.magnifyingglass")
                                    .font(AppFont.body(15, weight: .semibold))
                                    .foregroundStyle(AppTheme.Colors.label)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
                if task.hasSubtasks {
                    TaskSubtasksCard(task: task)
                }
                if !task.statusHistory.isEmpty {
                    TaskHistoryCard(history: task.statusHistory)
                }
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.sm)
        }
        .refreshable { await Task { await viewModel.load() }.value }
        .safeAreaInset(edge: .bottom) {
            if viewModel.canUpdate && !viewModel.allowedTransitions.isEmpty {
                actionBar
            }
        }
    }

    /// Edits (people, visibility, prep ticks) only while the task is open.
    private func canEdit(_ task: TaskResponse) -> Bool {
        viewModel.canUpdate && !task.status.isClosed
    }

    // MARK: - Action bar

    /// Forward step of the flow (start / finish); the rest are icon buttons.
    private var primaryTransition: TaskStatus? {
        viewModel.allowedTransitions.first { $0 == .IN_LUCRU || $0 == .FINALIZAT }
    }

    private var secondaryTransitions: [TaskStatus] {
        viewModel.allowedTransitions.filter { $0 != primaryTransition }
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            ForEach(secondaryTransitions) { status in
                TaskActionIconButton(status: status, disabled: viewModel.isTransitioning) {
                    perform(status)
                }
            }
            if let primary = primaryTransition {
                let button = TaskPrimaryActionButton(
                    status: primary, isWorking: viewModel.isTransitioning
                ) { perform(primary) }
                if primary == .IN_LUCRU {
                    button.tutorialAnchor(id: "tasks.transitions.start")
                } else {
                    button.tutorialAnchor(id: "tasks.transitions.finalize")
                }
            }
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background {
            AppTheme.Colors.card
                .overlay(alignment: .top) {
                    Rectangle().fill(AppTheme.Colors.border).frame(height: 1)
                }
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private func perform(_ status: TaskStatus) {
        switch status {
        case .ANULAT:
            cancelReason = ""
            showCancelReasonAlert = true
        case .FINALIZAT:
            showYieldSheet = true
        default:
            Task { await transition(to: status) }
        }
    }

    private func transition(
        to status: TaskStatus,
        reason: String? = nil,
        actualYield: Double? = nil,
        outputLocationId: String? = nil
    ) async {
        await viewModel.transition(
            to: status, reason: reason, actualYield: actualYield, outputLocationId: outputLocationId)
        if viewModel.error == nil { transitionTrigger += 1 }
    }
}

#Preview {
    NavigationStack {
        TaskDetailView(taskId: "preview")
    }
}
