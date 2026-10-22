package com.horae.app.ui.tasks

import com.google.common.truth.Truth.assertThat
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.TaskResponse
import com.horae.app.data.repository.TaskRepository
import com.horae.app.domain.model.TaskStatus
import com.horae.app.testutil.Fixtures.page
import com.horae.app.testutil.Fixtures.task
import com.horae.app.testutil.MainDispatcherRule
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import java.io.IOException

/** Producție board: five lanes, one `GET /tasks?status=…` each, server totals. */
@OptIn(ExperimentalCoroutinesApi::class)
class TaskBoardTest {

    @get:Rule val main = MainDispatcherRule()

    private val repo = mockk<TaskRepository>()

    private fun lane(status: TaskStatus, tasks: List<TaskResponse>, total: Int = tasks.size, myDay: Boolean = false) {
        coEvery {
            repo.getTasks(page = 1, limit = any(), status = status.name, search = null, myDay = myDay, sort = sortFor(status))
        } returns page(tasks, total = total)
    }

    private fun TestScope.board(): TaskListViewModel = TaskListViewModel(repo).also { advanceUntilIdle() }

    @Test fun `lane order matches the web board`() {
        assertThat(BOARD_LANES).containsExactly(
            TaskStatus.DE_FACUT, TaskStatus.IN_LUCRU, TaskStatus.BLOCAT, TaskStatus.FINALIZAT, TaskStatus.ANULAT,
        ).inOrder()
    }

    @Test fun `closed lanes sort by completion, open lanes by deadline`() {
        assertThat(sortFor(TaskStatus.FINALIZAT)).isEqualTo("completed")
        assertThat(sortFor(TaskStatus.ANULAT)).isEqualTo("completed")
        assertThat(sortFor(TaskStatus.DE_FACUT)).isEqualTo("due")
        assertThat(sortFor(TaskStatus.BLOCAT)).isEqualTo("due")
    }

    @Test fun `tasks land in their five lanes with server totals`() = runTest(main.dispatcher) {
        lane(TaskStatus.DE_FACUT, listOf(task("a"), task("b")), total = 25)
        lane(TaskStatus.IN_LUCRU, listOf(task("c", "IN_LUCRU")))
        lane(TaskStatus.BLOCAT, listOf(task("d", "BLOCAT")))
        lane(TaskStatus.FINALIZAT, emptyList())
        lane(TaskStatus.ANULAT, emptyList())
        val s = board().uiState.value
        assertThat(s.lanes.keys).containsExactlyElementsIn(BOARD_LANES)
        assertThat(s.lane(TaskStatus.DE_FACUT).tasks.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(s.lane(TaskStatus.DE_FACUT).total).isEqualTo(25)
        assertThat(s.lane(TaskStatus.IN_LUCRU).tasks.map { it.id }).containsExactly("c")
        assertThat(s.lane(TaskStatus.BLOCAT).tasks.map { it.id }).containsExactly("d")
        assertThat(s.allTasks.map { it.id }).containsExactly("a", "b", "c", "d").inOrder()
        assertThat(s.summary).isEqualTo("27 active · 1 blocat")
        assertThat(s.isEmpty).isFalse()
    }

    @Test fun `empty lanes stay present and empty`() = runTest(main.dispatcher) {
        BOARD_LANES.forEach { lane(it, emptyList()) }
        val s = board().uiState.value
        BOARD_LANES.forEach { st ->
            assertThat(s.lane(st).tasks).isEmpty()
            assertThat(s.lane(st).total).isEqualTo(0)
        }
        assertThat(s.isEmpty).isTrue()
        assertThat(s.summary).isEqualTo("0 active")
    }

    @Test fun `duplicate ids in a lane are dropped`() = runTest(main.dispatcher) {
        BOARD_LANES.forEach { lane(it, emptyList()) }
        lane(TaskStatus.DE_FACUT, listOf(task("a"), task("a"), task("b")))
        assertThat(board().uiState.value.lane(TaskStatus.DE_FACUT).tasks.map { it.id }).containsExactly("a", "b")
    }

    @Test fun `a failing lane keeps its old cards and reports a Romanian error`() = runTest(main.dispatcher) {
        BOARD_LANES.forEach { lane(it, emptyList()) }
        lane(TaskStatus.IN_LUCRU, listOf(task("c", "IN_LUCRU")))
        val vm = board()
        coEvery { repo.getTasks(page = 1, limit = any(), status = "IN_LUCRU", search = null, myDay = false, sort = "due") } throws IOException()
        vm.refresh()
        advanceUntilIdle()
        val s = vm.uiState.value
        assertThat(s.lane(TaskStatus.IN_LUCRU).tasks.map { it.id }).containsExactly("c")
        assertThat(s.error).isEqualTo("Nu există conexiune la internet. Încearcă din nou.")
        assertThat(s.isRefreshing).isFalse()
    }

    @Test fun `load more asks the next page of one lane and dedupes`() = runTest(main.dispatcher) {
        BOARD_LANES.forEach { lane(it, emptyList()) }
        val first = (1..20).map { task("t$it") }
        lane(TaskStatus.DE_FACUT, first, total = 22)
        val vm = board()
        coEvery { repo.getTasks(page = 2, limit = 20, status = "DE_FACUT", search = null, myDay = false, sort = "due") } returns
            page(listOf(task("t20"), task("t21"), task("t22")), total = 22)
        vm.loadMore(TaskStatus.DE_FACUT)
        advanceUntilIdle()
        val l = vm.uiState.value.lane(TaskStatus.DE_FACUT)
        assertThat(l.tasks.map { it.id }).hasSize(22)
        assertThat(l.tasks.last().id).isEqualTo("t22")
        assertThat(l.loadingMore).isFalse()
        vm.loadMore(TaskStatus.DE_FACUT) // all loaded → no call
        advanceUntilIdle()
        coVerify(exactly = 1) { repo.getTasks(page = 2, limit = 20, status = "DE_FACUT", search = null, myDay = false, sort = "due") }
    }

    @Test fun `Ziua mea reloads every lane with myDay`() = runTest(main.dispatcher) {
        BOARD_LANES.forEach { lane(it, emptyList()) }
        BOARD_LANES.forEach { lane(it, emptyList(), myDay = true) }
        lane(TaskStatus.IN_LUCRU, listOf(task("mine", "IN_LUCRU")), myDay = true)
        val vm = board()
        vm.toggleMyDay()
        advanceUntilIdle()
        assertThat(vm.uiState.value.myDay).isTrue()
        assertThat(vm.uiState.value.lane(TaskStatus.IN_LUCRU).tasks.map { it.id }).containsExactly("mine")
        BOARD_LANES.forEach { st ->
            coVerify { repo.getTasks(page = 1, limit = any(), status = st.name, search = null, myDay = true, sort = sortFor(st)) }
        }
    }

    @Test fun `summary pluralises blocked`() {
        val s = TaskListUiState(
            hasLoaded = true,
            lanes = BOARD_LANES.associateWith { TaskLane() } + (TaskStatus.BLOCAT to TaskLane(total = 3)),
        )
        assertThat(s.summary).isEqualTo("3 active · 3 blocate")
        assertThat(TaskListUiState().summary).isNull()
    }

    @Test fun `lane lookup for a missing status is an empty lane`() {
        val s = TaskListUiState(lanes = emptyMap<TaskStatus, TaskLane>())
        assertThat(s.lane(TaskStatus.BLOCAT)).isEqualTo(TaskLane())
        @Suppress("UNUSED_VARIABLE") val unused: PaginatedResponse<TaskResponse>? = null
    }
}
