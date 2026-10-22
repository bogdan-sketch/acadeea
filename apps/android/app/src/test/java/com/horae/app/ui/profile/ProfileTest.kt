package com.horae.app.ui.profile

import com.google.common.truth.Truth.assertThat
import com.horae.app.data.remote.dto.ChangelogEntryDto
import com.horae.app.data.remote.dto.ChangelogResponseDto
import com.horae.app.data.remote.dto.IntegrationResponseDto
import com.horae.app.data.remote.dto.InvitationResponse
import com.horae.app.data.remote.dto.OrgSnapshotDto
import com.horae.app.data.repository.ChangelogRepository
import com.horae.app.data.repository.IntegrationRepository
import com.horae.app.data.repository.LocationRepository
import com.horae.app.data.repository.OrganizationRepository
import com.horae.app.data.repository.RoleRepository
import com.horae.app.data.repository.UserRepository
import com.horae.app.domain.model.UserRole
import com.horae.app.testutil.Fixtures.location
import com.horae.app.testutil.Fixtures.page
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

/** Profil: administrators get the Setări tab; Setări loads are best-effort. */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileTest {

    @get:Rule val main = MainDispatcherRule()

    @Test fun `administrator sees Date and Setări`() {
        assertThat(profileTabs(UserRole.ADMINISTRATOR)).containsExactly(ProfileTab.DATE, ProfileTab.SETARI).inOrder()
        assertThat(ProfileTab.SETARI.label).isEqualTo("Setări")
    }

    @Test fun `every other role sees only Date`() {
        UserRole.entries.filter { it != UserRole.ADMINISTRATOR }.forEach { role ->
            assertThat(profileTabs(role)).containsExactly(ProfileTab.DATE)
        }
    }

    private val users = mockk<UserRepository>()
    private val orgs = mockk<OrganizationRepository>()
    private val locs = mockk<LocationRepository>()
    private val roles = mockk<RoleRepository>()
    private val integrations = mockk<IntegrationRepository>()
    private val changelog = mockk<ChangelogRepository>()

    private fun integration(id: String, provider: String) = IntegrationResponseDto(id, provider, "ACTIVE", createdAt = "2026-01-01T00:00:00Z")
    private fun invite(id: String, expiresAt: String, acceptedAt: String? = null) =
        InvitationResponse(id, "$id@x.ro", "COFETAR", "u1", expiresAt, acceptedAt, "2026-01-01T00:00:00Z")

    private fun vm() = ProfileViewModel(
        mockk(relaxed = true), mockk(relaxed = true), users, orgs, locs, roles, integrations, changelog, mockk(relaxed = true),
    )

    private fun TestScope.loaded(isRoot: Boolean = true): ProfileViewModel {
        coEvery { orgs.loadOrganization() } returns mockk(relaxed = true)
        coEvery { locs.getLocations() } returns listOf(location("l1"), location("l2", active = false))
        coEvery { users.getUsers(page = 1, limit = 1) } returns page(emptyList(), total = 14)
        coEvery { roles.getRoles() } returns List(5) { mockk(relaxed = true) }
        coEvery { users.getInvitations() } returns listOf(
            invite("open", "2999-01-01T00:00:00Z"),
            invite("expired", "2020-01-01T00:00:00Z"),
            invite("accepted", "2999-01-01T00:00:00Z", acceptedAt = "2026-10-01T00:00:00Z"),
        )
        coEvery { integrations.getAll() } returns listOf(integration("e", "EBRIZA"), integration("w", "WOOCOMMERCE"))
        coEvery { changelog.getChangelog() } returns ChangelogResponseDto("1.35.2", listOf(ChangelogEntryDto("1.35.2", "2026-10-17", "Nou"), ChangelogEntryDto("1.35.1", "2026-10-10", "Vechi")))
        coEvery { orgs.categoryGroups() } returns listOf("Patiserie" to listOf("Torturi"))
        coEvery { orgs.snapshots() } returns listOf(
            OrgSnapshotDto("s1", createdAt = "2026-10-01T00:00:00Z"),
            OrgSnapshotDto("s2", createdAt = "2026-10-15T00:00:00Z"),
        )
        return vm().also { it.loadSettings(isRoot); advanceUntilIdle() }
    }

    @Test fun `Setări summaries load`() = runTest(main.dispatcher) {
        val vm = loaded()
        assertThat(vm.org).isNotNull()
        assertThat(vm.locations.map { it.id }).containsExactly("l1")
        assertThat(vm.locationsLoaded).isTrue()
        assertThat(vm.peopleCount).isEqualTo(14)
        assertThat(vm.rolesCount).isEqualTo(5)
        assertThat(vm.pendingInvites).isEqualTo(1) // not accepted and not expired
        assertThat(vm.shop?.id).isEqualTo("w") // WooCommerce first
        assertThat(vm.release?.version).isEqualTo("1.35.2")
        assertThat(vm.categoryGroups).containsExactly("Patiserie" to listOf("Torturi"))
        assertThat(vm.snapshots!!.map { it.id }).containsExactly("s2", "s1").inOrder() // newest first
    }

    @Test fun `Setări loads once unless forced`() = runTest(main.dispatcher) {
        val vm = loaded()
        vm.loadSettings(isRoot = true)
        advanceUntilIdle()
        coVerify(exactly = 1) { orgs.loadOrganization() }
        vm.loadSettings(isRoot = true, force = true)
        advanceUntilIdle()
        coVerify(exactly = 2) { orgs.loadOrganization() }
    }

    @Test fun `snapshots are only read for the root admin`() = runTest(main.dispatcher) {
        val vm = loaded(isRoot = false)
        assertThat(vm.snapshots).isNull()
        coVerify(exactly = 0) { orgs.snapshots() }
    }

    @Test fun `failing sections fall back to neutral states`() = runTest(main.dispatcher) {
        coEvery { orgs.loadOrganization() } throws IOException()
        coEvery { locs.getLocations() } throws IOException()
        coEvery { users.getUsers(page = 1, limit = 1) } throws IOException()
        coEvery { roles.getRoles() } throws IOException()
        coEvery { users.getInvitations() } throws IOException()
        coEvery { integrations.getAll() } throws IOException()
        coEvery { changelog.getChangelog() } throws IOException()
        coEvery { orgs.categoryGroups() } throws IOException()
        coEvery { orgs.snapshots() } throws IOException()
        val vm = vm().also { it.loadSettings(isRoot = true); advanceUntilIdle() }
        assertThat(vm.org).isNull()
        assertThat(vm.locations).isEmpty()
        assertThat(vm.locationsLoaded).isTrue()
        assertThat(vm.peopleCount).isNull()
        assertThat(vm.rolesCount).isNull()
        assertThat(vm.pendingInvites).isEqualTo(0)
        assertThat(vm.integrations).isEmpty()
        assertThat(vm.shop).isNull()
        assertThat(vm.categoryGroups).isEmpty()
        assertThat(vm.snapshots).isNull()
        assertThat(vm.message).isNull() // no error toast for summaries
    }

    @Test fun `shop falls back to any connection`() = runTest(main.dispatcher) {
        coEvery { orgs.loadOrganization() } returns mockk(relaxed = true)
        coEvery { locs.getLocations() } returns emptyList()
        coEvery { users.getUsers(page = 1, limit = 1) } returns page(emptyList())
        coEvery { roles.getRoles() } returns emptyList()
        coEvery { users.getInvitations() } returns emptyList()
        coEvery { integrations.getAll() } returns listOf(integration("e", "EBRIZA"))
        coEvery { changelog.getChangelog() } returns ChangelogResponseDto("1", emptyList())
        coEvery { orgs.categoryGroups() } returns emptyList()
        val vm = vm().also { it.loadSettings(isRoot = false); advanceUntilIdle() }
        assertThat(vm.shop?.id).isEqualTo("e")
        assertThat(vm.release).isNull()
    }
}
