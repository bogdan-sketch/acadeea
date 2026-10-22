package com.horae.app.ui.tasks

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.TaskResponse
import com.horae.app.data.remote.dto.TaskUserDto
import com.horae.app.data.repository.TaskRepository
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.TaskStatus
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.AccentGradientBackground
import com.horae.app.ui.common.BulkActionCatalog
import com.horae.app.ui.common.BulkDeleteResultDialog
import com.horae.app.ui.common.BulkDeleteWarnings
import com.horae.app.ui.common.BulkOutcome
import com.horae.app.ui.common.BulkSelectBottomBar
import com.horae.app.ui.common.BulkSelectCheckbox
import com.horae.app.ui.common.BulkSelectInlineHeader
import com.horae.app.ui.common.BulkSelectionState
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HCard
import com.horae.app.ui.common.CollapsingHeaderLayout
import com.horae.app.ui.common.HChip
import com.horae.app.ui.common.HFab
import com.horae.app.ui.common.HIconButton
import com.horae.app.ui.common.HScreenTitle
import com.horae.app.ui.common.HSearchField
import com.horae.app.ui.common.HSecondaryButton
import com.horae.app.ui.common.HoraeRefreshBox
import com.horae.app.ui.common.PriorityBadge
import com.horae.app.ui.common.RequestGate
import com.horae.app.ui.common.RoDate
import com.horae.app.ui.common.rememberBulkSelectionState
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.StatusPalette
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

// ---------------------------------------------------------------------------
// Board model
// ---------------------------------------------------------------------------

/** Lane order (web `BOARD_COLUMNS`, owner 17.10.2026). */
val BOARD_LANES: List<TaskStatus> = listOf(
    TaskStatus.DE_FACUT, TaskStatus.IN_LUCRU, TaskStatus.BLOCAT, TaskStatus.FINALIZAT, TaskStatus.ANULAT,
)

/** Finalizat / Anulat: latest closed first; the other lanes by deadline (web `sortFor`). */
internal fun sortFor(status: TaskStatus): String = if (status.isClosed) "completed" else "due"

/** Cards per lane page ("Afișează mai multe" loads the next one). */
private const val LANE_PAGE = 20

data class TaskLane(
    val tasks: List<TaskResponse> = emptyList(),
    /** Server total for this status (not the loaded count) — B14. */
    val total: Int = 0,
    val loadingMore: Boolean = false,
)

data class TaskListUiState(
    val lanes: Map<TaskStatus, TaskLane> = BOARD_LANES.associateWith { TaskLane() },
    val myDay: Boolean = false,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val hasLoaded: Boolean = false,
    val error: String? = null,
    val search: String = "",
    /** Select & delete (bulk) — in flight / last result. */
    val isPreviewing: Boolean = false,
    val bulkPreview: BulkDeletePreviewDto? = null,
    val isDeleting: Boolean = false,
    val isActing: Boolean = false,
    val bulkResult: BulkOutcome? = null,
) {
    fun lane(status: TaskStatus): TaskLane = lanes[status] ?: TaskLane()
    val allTasks: List<TaskResponse> get() = BOARD_LANES.flatMap { lane(it).tasks }
    val isEmpty: Boolean get() = BOARD_LANES.all { lane(it).total == 0 && lane(it).tasks.isEmpty() }

    /** Eyebrow: "12 active · 2 blocate". */
    val summary: String?
        get() {
            if (!hasLoaded) return null
            val active = lane(TaskStatus.DE_FACUT).total + lane(TaskStatus.IN_LUCRU).total + lane(TaskStatus.BLOCAT).total
            val blocked = lane(TaskStatus.BLOCAT).total
            return buildList {
                add("$active active")
                if (blocked > 0) add(if (blocked == 1) "1 blocat" else "$blocked blocate")
            }.joinToString(" · ")
        }
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@OptIn(FlowPreview::class)
@HiltViewModel
class TaskListViewModel @Inject constructor(
    private val taskRepository: TaskRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TaskListUiState())
    val uiState: StateFlow<TaskListUiState> = _uiState.asStateFlow()

    private val searchQuery = MutableStateFlow("")
    /** Only the newest board load may write (search / Ziua mea / refresh supersede older ones). */
    private val gate = RequestGate()

    init {
        reload()
        viewModelScope.launch {
            searchQuery.drop(1).debounce(400).distinctUntilChanged().collectLatest { reload() }
        }
    }

    private suspend fun fetchLane(status: TaskStatus, page: Int, limit: Int) = taskRepository.getTasks(
        page = page,
        limit = limit,
        status = status.name,
        search = _uiState.value.search.takeIf { it.isNotBlank() },
        myDay = _uiState.value.myDay,
        sort = sortFor(status),
    )

    /**
     * Reloads every lane in parallel (one `GET /tasks?status=…` each, so counts are the real
     * totals). Cards stay on screen meanwhile; a lane that fails keeps its old cards (R9).
     * [keepShown] keeps the pages already opened in each lane.
     */
    fun reload(keepShown: Boolean = false) {
        val token = gate.next()
        viewModelScope.launch {
            _uiState.update { if (it.hasLoaded) it.copy(isRefreshing = true) else it.copy(isLoading = true) }
            val previous = _uiState.value.lanes
            var failure: Throwable? = null
            val results = coroutineScope {
                BOARD_LANES.map { status ->
                    async {
                        val shown = if (keepShown) previous[status]?.tasks?.size ?: 0 else 0
                        val limit = maxOf(LANE_PAGE, ((shown + LANE_PAGE - 1) / LANE_PAGE) * LANE_PAGE)
                        try {
                            val res = fetchLane(status, 1, limit)
                            status to TaskLane(res.data.distinctBy { it.id }, res.total)
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            Timber.e(e, "TaskListViewModel: lane $status failed")
                            if (!ApiErrors.isCancellation(e)) failure = e
                            status to (previous[status] ?: TaskLane())
                        }
                    }
                }.awaitAll().toMap()
            }
            if (!gate.isCurrent(token)) return@launch
            _uiState.update {
                it.copy(
                    lanes = results,
                    isLoading = false,
                    isRefreshing = false,
                    hasLoaded = true,
                    error = failure?.let { e -> ApiErrors.userMessage(e, "Nu am putut încărca producția.") } ?: it.error,
                )
            }
        }
    }

    fun refresh() = reload(keepShown = true)

    /** Next page of one lane only; new cards are de-duplicated against the loaded ones. */
    fun loadMore(status: TaskStatus) {
        val lane = _uiState.value.lane(status)
        if (lane.loadingMore || lane.tasks.size >= lane.total) return
        val token = gate.next()
        viewModelScope.launch {
            _uiState.update { it.copy(lanes = it.lanes + (status to lane.copy(loadingMore = true))) }
            try {
                val page = lane.tasks.size / LANE_PAGE + 1
                val res = fetchLane(status, page, LANE_PAGE)
                if (!gate.isCurrent(token)) return@launch
                _uiState.update { s ->
                    val cur = s.lane(status)
                    val seen = cur.tasks.map { it.id }.toHashSet()
                    s.copy(lanes = s.lanes + (status to TaskLane(cur.tasks + res.data.filter { seen.add(it.id) }, res.total)))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.e(e, "TaskListViewModel: loadMore $status failed")
                _uiState.update { s ->
                    s.copy(
                        lanes = s.lanes + (status to s.lane(status).copy(loadingMore = false)),
                        error = if (ApiErrors.isCancellation(e)) s.error else ApiErrors.userMessage(e),
                    )
                }
            } finally {
                if (!gate.isCurrent(token)) {
                    _uiState.update { s -> s.copy(lanes = s.lanes + (status to s.lane(status).copy(loadingMore = false))) }
                }
            }
        }
    }

    /** „Ziua mea" — doar taskurile mele relevante azi. */
    fun toggleMyDay() {
        _uiState.update { it.copy(myDay = !it.myDay) }
        reload()
    }

    fun onSearchChange(query: String) {
        _uiState.update { it.copy(search = query) }
        searchQuery.value = query
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun bulkDelete(ids: List<String>) {
        if (ids.isEmpty() || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true) }
            try {
                val result = taskRepository.bulkDelete(ids)
                _uiState.update { it.copy(isDeleting = false, bulkPreview = null, bulkResult = BulkOutcome.ofDelete(result)) }
                refresh()
            } catch (e: Exception) {
                Timber.e(e, "TaskListViewModel: bulkDelete failed")
                _uiState.update { it.copy(isDeleting = false, bulkPreview = null, error = ApiErrors.userMessage(e, "Eroare la ștergere")) }
            }
        }
    }

    fun previewBulkDelete(ids: List<String>) {
        if (ids.isEmpty() || _uiState.value.isPreviewing || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isPreviewing = true) }
            try {
                val preview = taskRepository.bulkDeletePreview(ids)
                _uiState.update { it.copy(isPreviewing = false, bulkPreview = preview) }
            } catch (e: Exception) {
                Timber.e(e, "TaskListViewModel: previewBulkDelete failed")
                _uiState.update { it.copy(isPreviewing = false, error = ApiErrors.userMessage(e, "Nu am putut verifica ce se șterge")) }
            }
        }
    }

    fun clearBulkPreview() {
        _uiState.update { it.copy(bulkPreview = null) }
    }

    fun bulkAction(ids: List<String>, action: String, params: Map<String, Any?>?) {
        if (ids.isEmpty() || _uiState.value.isActing || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isActing = true) }
            try {
                val result = taskRepository.bulkAction(ids, action, params)
                _uiState.update { it.copy(isActing = false, bulkResult = BulkOutcome.ofAction(result)) }
                refresh()
            } catch (e: Exception) {
                Timber.e(e, "TaskListViewModel: bulkAction failed")
                _uiState.update { it.copy(isActing = false, error = ApiErrors.userMessage(e, "Eroare la aplicarea acțiunii")) }
            }
        }
    }

    fun clearBulkResult() {
        _uiState.update { it.copy(bulkResult = null) }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/** Romanian status label (kept for callers; the enum carries the diacritics now). */
internal fun taskStatusLabel(status: TaskStatus): String = status.displayName

/**
 * Producție: a five-lane board (De făcut · În lucru · Blocat · Finalizat · Anulat), lanes side
 * by side and scrolling sideways on a phone. Each lane header shows the SERVER total; an
 * empty lane shows nothing under its header. Search + „Ziua mea", pull-to-refresh keeps cards.
 */
@Composable
fun TaskListScreen(
    navController: NavController,
    role: UserRole = UserRole.ADMINISTRATOR,
    viewModel: TaskListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val s = HoraeTheme.scheme
    val canCreate = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.TASK)
    val canDelete = PermissionManager.can(role, CASLAction.DELETE, CASLSubject.TASK)
    val canAct = PermissionManager.can(role, CASLAction.UPDATE, CASLSubject.TASK)
    val canSelect = canDelete || canAct
    val bulk = rememberBulkSelectionState()

    // Back from a task detail / form: show its new status without a pull.
    var resumedOnce by remember { mutableStateOf(false) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (resumedOnce) viewModel.refresh() else resumedOnce = true
    }

    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::clearError) }
    BulkDeleteResultDialog(
        result = state.bulkResult,
        onDismiss = {
            viewModel.clearBulkResult()
            bulk.exit()
        },
    )

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        containerColor = s.background,
        floatingActionButton = {
            if (canCreate && !bulk.isActive) {
                HFab(contentDescription = "Task nou", onClick = { navController.navigate(TasksRoutes.CREATE) })
            }
        },
        bottomBar = {
            if (bulk.isActive) {
                BulkSelectBottomBar(
                    state = bulk,
                    warning = BulkDeleteWarnings.TASKS,
                    preview = state.bulkPreview,
                    isPreviewing = state.isPreviewing,
                    isDeleting = state.isDeleting,
                    onRequestPreview = viewModel::previewBulkDelete,
                    onDismissPreview = viewModel::clearBulkPreview,
                    onConfirmDelete = viewModel::bulkDelete,
                    canDelete = canDelete,
                    actions = BulkActionCatalog.tasks,
                    canAct = canAct,
                    isActing = state.isActing,
                    onRunAction = viewModel::bulkAction,
                )
            }
        },
    ) { innerPadding ->
        AccentGradientBackground(Modifier.padding(innerPadding), showGradient = false) {
            // Head (title, search) hides on scroll down / returns on scroll up; the "Ziua mea"
            // pill row stays pinned, outside the pull-to-refresh (1.39.0).
            CollapsingHeaderLayout(
                modifier = Modifier.fillMaxSize(),
                header = {
                    if (bulk.isActive) {
                        BulkSelectInlineHeader(state = bulk, allIds = state.allTasks.map { it.id }, modifier = Modifier.padding(top = 8.dp))
                    } else {
                        HScreenTitle(
                            title = "Producție",
                            eyebrow = state.summary,
                            modifier = Modifier.padding(start = 20.dp, end = 12.dp, top = 12.dp),
                            trailing = {
                                if (canSelect) HIconButton(Icons.Filled.Checklist, "Selectează taskuri", { bulk.enter() })
                            },
                        )
                    }
                    HSearchField(
                        value = state.search,
                        onValueChange = viewModel::onSearchChange,
                        placeholder = "Caută taskuri",
                        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp),
                    )
                },
                pinned = {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                        HChip(
                            label = "Ziua mea",
                            selected = state.myDay,
                            onClick = viewModel::toggleMyDay,
                            icon = Icons.Filled.Person,
                            modifier = Modifier.tutorialAnchor("calendar.myDay.filter"),
                        )
                    }
                },
            ) {
                HoraeRefreshBox(
                    isRefreshing = state.isRefreshing,
                    onRefresh = viewModel::refresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    if (!state.hasLoaded) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = s.primary)
                        }
                    } else {
                        TaskBoard(
                            state = state,
                            selection = bulk.takeIf { canSelect },
                            onOpen = { navController.navigate(TasksRoutes.detail(it.id)) },
                            onLoadMore = viewModel::loadMore,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskBoard(
    state: TaskListUiState,
    selection: BulkSelectionState?,
    onOpen: (TaskResponse) -> Unit,
    onLoadMore: (TaskStatus) -> Unit,
) {
    // ~1,15 lanes per phone screen so the next lane peeks in; tablets fit them all.
    val screenWidth = LocalConfiguration.current.screenWidthDp.dp
    val laneWidth = ((screenWidth - 32.dp - 32.dp) / 5).coerceIn(272.dp, 360.dp)
    LazyRow(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(BOARD_LANES, key = { it.name }) { status ->
            TaskLaneColumn(
                status = status,
                lane = state.lane(status),
                width = laneWidth,
                selection = selection,
                onOpen = onOpen,
                onLoadMore = { onLoadMore(status) },
            )
        }
    }
}

@Composable
private fun TaskLaneColumn(
    status: TaskStatus,
    lane: TaskLane,
    width: androidx.compose.ui.unit.Dp,
    selection: BulkSelectionState?,
    onOpen: (TaskResponse) -> Unit,
    onLoadMore: () -> Unit,
) {
    val s = HoraeTheme.scheme
    val dot = StatusPalette.color(status.kind, s).takeIf { status.kind != null } ?: s.muted
    LazyColumn(
        modifier = Modifier.width(width).fillMaxHeight(),
        contentPadding = PaddingValues(bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item(key = "header") {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 6.dp)
                    .semantics(mergeDescendants = true) {
                        heading()
                        contentDescription = "${status.displayName}, ${if (lane.total == 1) "1 task" else "${lane.total} taskuri"}"
                    },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(9.dp).clip(CircleShape).background(dot))
                Spacer(Modifier.width(8.dp))
                Text(status.displayName, style = AppFont.body(14f, FontWeight.Bold), color = s.ink, modifier = Modifier.weight(1f))
                Text("${lane.total}", style = AppFont.body(13f, FontWeight.Bold), color = s.muted)
            }
        }
        // An empty lane shows nothing below its header.
        items(lane.tasks, key = { it.id }) { task ->
            TaskBoardCard(task = task, selection = selection, onClick = { onOpen(task) })
        }
        if (lane.tasks.size < lane.total) {
            item(key = "more") {
                HSecondaryButton(
                    text = if (lane.loadingMore) "Se încarcă…" else "Afișează mai multe (${lane.total - lane.tasks.size})",
                    onClick = onLoadMore,
                    enabled = !lane.loadingMore,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/** Card: name + quantity WITH unit, priority, assignee, deadline / local times (Bucharest). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun TaskBoardCard(
    task: TaskResponse,
    onClick: () -> Unit,
    selection: BulkSelectionState? = null,
) {
    val s = HoraeTheme.scheme
    val status = TaskStatus.fromString(task.status)
    val selecting = selection?.isActive == true
    val overdue = status?.isClosed == false && task.dueDate != null && RoDate.isPastDeadline(task.dueDate)
    val timeLine = taskTimeLine(task, status)
    HCard(
        padding = PaddingValues(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .combinedClickable(
                onClickLabel = "Deschide taskul",
                onClick = { if (selecting) selection!!.toggle(task.id) else onClick() },
                onLongClick = selection?.let { sel -> { if (!sel.isActive) { sel.enter(); sel.toggle(task.id) } } },
            )
            .semantics(mergeDescendants = true) {
                contentDescription = listOfNotNull(task.name, task.quantityText, task.assignedTo?.fullName ?: "Nealocat", timeLine).joinToString(", ")
            },
    ) {
        Row(verticalAlignment = Alignment.Top) {
            if (selecting) {
                BulkSelectCheckbox(state = selection!!, id = task.id)
                Spacer(Modifier.width(8.dp))
            }
            Text(
                task.name,
                style = AppFont.body(15f, FontWeight.Bold),
                color = s.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            Text(task.quantityBadge, style = AppFont.display(20f), color = s.ink, maxLines = 1)
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (task.priority > 0) {
                PriorityBadge(priority = task.priority)
                Spacer(Modifier.width(6.dp))
            }
            Text(
                task.assignedTo?.let { shortName(it.fullName) } ?: "Nealocat",
                style = AppFont.body(12f),
                color = s.muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            timeLine?.let {
                Text(
                    it,
                    style = AppFont.body(12f, if (overdue) FontWeight.Bold else FontWeight.Normal),
                    color = if (overdue) StatusPalette.fg(StatusKind.DANGER, s.isDark) else s.muted,
                    maxLines = 1,
                )
            }
        }
    }
}

/** "Ana P." from "Ana Popescu". */
private fun shortName(full: String): String {
    val parts = full.trim().split(Regex("\\s+"))
    return if (parts.size < 2) full else "${parts.first()} ${parts.last().first()}."
}

/**
 * The card's time: closed → when it closed ("azi, 12:08"); in progress → "din 09:08";
 * otherwise the deadline ("mâine", "17 oct., 11:30"). All in Bucharest time.
 */
internal fun taskTimeLine(task: TaskResponse, status: TaskStatus?): String? = when {
    status == TaskStatus.FINALIZAT && task.completedAt != null -> RoDate.deadline(task.completedAt)
    status == TaskStatus.ANULAT && task.cancelledAt != null -> RoDate.deadline(task.cancelledAt)
    status == TaskStatus.IN_LUCRU && task.startedAt != null -> "din ${RoDate.time(task.startedAt)}"
    task.dueDate != null -> RoDate.deadline(task.dueDate)
    else -> null
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

@Preview(showBackground = true, widthDp = 320)
@Composable
private fun TaskBoardCardPreview() {
    val user = TaskUserDto("u1", "Ana", "Popescu")
    val task = TaskResponse(
        id = "t1", recipeId = "r1", scaleFactor = 1.0, targetQuantity = 2.0, targetUnit = "BUCATI",
        status = "IN_LUCRU", priority = 2, dueDate = "2026-10-17T00:00:00.000Z", notes = null,
        createdById = "u1", assignedToId = "u1", startedAt = "2026-10-17T06:08:00.000Z", completedAt = null,
        cancelledAt = null, cancelReason = null, actualYield = null, varianceAbsolute = null, variancePercent = null,
        recipeName = "Aluat choux mari", createdBy = user, assignedTo = user, statusHistory = emptyList(),
        createdAt = "2026-10-17T06:00:00.000Z", updatedAt = "2026-10-17T06:08:00.000Z",
    )
    HoraeTheme {
        Column(Modifier.padding(16.dp)) { TaskBoardCard(task = task, onClick = {}) }
    }
}
