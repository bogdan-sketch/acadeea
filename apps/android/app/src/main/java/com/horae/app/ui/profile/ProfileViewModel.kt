package com.horae.app.ui.profile

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.horae.app.data.local.BrandingManager
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.ChangelogEntryDto
import com.horae.app.data.remote.dto.IntegrationResponseDto
import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.remote.dto.OrgSnapshotDto
import com.horae.app.data.remote.dto.OrganizationBranding
import com.horae.app.data.remote.dto.UpdateCompanyRequest
import com.horae.app.data.repository.AuthRepository
import com.horae.app.data.repository.ChangelogRepository
import com.horae.app.data.repository.IntegrationRepository
import com.horae.app.data.repository.LocationRepository
import com.horae.app.data.repository.OrganizationRepository
import com.horae.app.data.repository.RoleRepository
import com.horae.app.data.repository.UserRepository
import com.horae.app.domain.model.User
import com.horae.app.ui.common.RoDate
import com.horae.app.ui.common.runRefresh
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import javax.inject.Inject

/** Logo slots of Profil › Setări › Identitate. */
enum class LogoSlot(val variant: String, val title: String, val subtitle: String) {
    LIGHT("login-light", "Logo pe fundal deschis", "Pe schemele luminoase: Panou, bara laterală, avize"),
    DARK("login-dark", "Logo pe fundal întunecat", "Pe schemele întunecate; fără el se folosește logo-ul deschis"),
}

/**
 * Profil & setări (iOS `ProfileView` + `ProfileSettingsModel`): the person's own data
 * (Date) and, for administrators, the organisation summaries (Setări). Every Setări
 * load is best-effort: a failing call leaves its section on a neutral state.
 */
@HiltViewModel
class ProfileViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val authRepository: AuthRepository,
    private val userRepository: UserRepository,
    private val organizationRepository: OrganizationRepository,
    private val locationRepository: LocationRepository,
    private val roleRepository: RoleRepository,
    private val integrationRepository: IntegrationRepository,
    private val changelogRepository: ChangelogRepository,
    val brandingManager: BrandingManager,
) : ViewModel() {

    // ── Date ──
    var isSavingName by mutableStateOf(false)
        private set
    var isAvatarWorking by mutableStateOf(false)
        private set
    var isSendingReset by mutableStateOf(false)
        private set
    var isDeletingAccount by mutableStateOf(false)
        private set
    var deleteError by mutableStateOf<String?>(null)
        private set

    // ── Setări ──
    var org by mutableStateOf<OrganizationBranding?>(null)
        private set
    var locations by mutableStateOf<List<LocationResponse>>(emptyList())
        private set
    var locationsLoaded by mutableStateOf(false)
        private set
    var peopleCount by mutableStateOf<Int?>(null)
        private set
    var rolesCount by mutableStateOf<Int?>(null)
        private set
    var pendingInvites by mutableStateOf(0)
        private set
    var integrations by mutableStateOf<List<IntegrationResponseDto>?>(null)
        private set
    /** Super-category name → its categories; null while loading or when the call failed. */
    var categoryGroups by mutableStateOf<List<Pair<String, List<String>>>?>(null)
        private set
    var snapshots by mutableStateOf<List<OrgSnapshotDto>?>(null)
        private set
    var release by mutableStateOf<ChangelogEntryDto?>(null)
        private set
    var settingDefault by mutableStateOf<String?>(null)
        private set
    var logoWorking by mutableStateOf<LogoSlot?>(null)
        private set
    var isBackingUp by mutableStateOf(false)
        private set
    var isSavingCompany by mutableStateOf(false)
        private set
    var isSavingWooDelivery by mutableStateOf(false)
        private set

    /** "Livrări din magazinul online" — the loaded org's value, else the cached one. */
    val wooDeliveryEnabled: Boolean
        get() = org?.wooDeliveryEnabled ?: brandingManager.wooDeliveryEnabled

    /** One-line feedback ("Salvat", errors) shown as a snackbar by the screen. */
    var message by mutableStateOf<String?>(null)
        private set

    private var settingsLoaded = false

    fun consumeMessage() {
        message = null
    }

    /** WooCommerce first (the "Comenzi din site" row), else any connection. */
    val shop: IntegrationResponseDto?
        get() = integrations?.firstOrNull { it.provider.equals("WOOCOMMERCE", true) } ?: integrations?.firstOrNull()

    // ── Date actions ─────────────────────────────────────────────────────

    fun saveName(user: User, first: String, last: String) {
        if (isSavingName) return
        viewModelScope.launch {
            isSavingName = true
            runRefresh(onError = { message = ApiErrors.userMessage(it) }) {
                userRepository.updateName(user.id, first, last)
                CurrentUserStore.updated = (CurrentUserStore.resolve(user) ?: user).copy(firstName = first, lastName = last)
                message = "Numele a fost salvat"
            }
            isSavingName = false
        }
    }

    fun uploadAvatar(user: User, uri: Uri) {
        if (isAvatarWorking) return
        viewModelScope.launch {
            isAvatarWorking = true
            runRefresh(onError = { message = ApiErrors.userMessage(it) }) {
                val (bytes, mime) = readImage(uri) ?: error("Nu am putut citi imaginea")
                userRepository.uploadMyAvatar(bytes, mime)
                refreshMe(user)
                message = "Poza de profil a fost actualizată"
            }
            isAvatarWorking = false
        }
    }

    fun deleteAvatar(user: User) {
        if (isAvatarWorking) return
        viewModelScope.launch {
            isAvatarWorking = true
            runRefresh(onError = { message = ApiErrors.userMessage(it) }) {
                userRepository.deleteMyAvatar()
                CurrentUserStore.updated = (CurrentUserStore.resolve(user) ?: user).copy(avatarUrl = null)
                message = "Poza de profil a fost ștearsă"
            }
            isAvatarWorking = false
        }
    }

    private suspend fun refreshMe(user: User) {
        CurrentUserStore.updated = runCatching { authRepository.fetchCurrentUser() }.getOrNull() ?: return
        if (CurrentUserStore.updated?.id != user.id) CurrentUserStore.updated = null
    }

    fun sendPasswordReset(email: String) {
        if (isSendingReset) return
        viewModelScope.launch {
            isSendingReset = true
            message = try {
                authRepository.requestPasswordReset(email)
                "Ți-am trimis un email cu linkul de schimbare a parolei"
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                "Nu am putut trimite emailul. Încearcă din nou."
            }
            isSendingReset = false
        }
    }

    fun deleteAccount(password: String, onSuccess: () -> Unit) {
        if (isDeletingAccount) return
        viewModelScope.launch {
            isDeletingAccount = true
            deleteError = null
            val ok = runRefresh(onError = { deleteError = ApiErrors.userMessage(it, "Nu am putut șterge contul. Încearcă din nou.") }) {
                authRepository.deleteAccount(password)
                true
            }
            isDeletingAccount = false
            if (ok == true) onSuccess()
        }
    }

    fun clearDeleteError() {
        deleteError = null
    }

    // ── Setări ───────────────────────────────────────────────────────────

    fun loadSettings(isRoot: Boolean, force: Boolean = false) {
        if (settingsLoaded && !force) return
        settingsLoaded = true
        viewModelScope.launch {
            val orgJob = async { runRefresh(onError = {}) { organizationRepository.loadOrganization() } }
            val locJob = async { runRefresh(onError = {}) { locationRepository.getLocations() } }
            val peopleJob = async { runRefresh(onError = {}) { userRepository.getUsers(page = 1, limit = 1).total } }
            val rolesJob = async { runRefresh(onError = {}) { roleRepository.getRoles().size } }
            val invitesJob = async { runRefresh(onError = {}) { userRepository.getInvitations() } }
            val integrationsJob = async { runRefresh(onError = {}) { integrationRepository.getAll() } }
            val changelogJob = async { runRefresh(onError = {}) { changelogRepository.getChangelog() } }
            val categoriesJob = async { runRefresh(onError = {}) { organizationRepository.categoryGroups() } }
            val snapshotsJob = async {
                if (isRoot) runRefresh(onError = {}) { organizationRepository.snapshots() } else null
            }

            orgJob.await()?.let { org = it }
            locJob.await()?.let { locations = it.filter { l -> l.isActive } }
            locationsLoaded = true
            peopleJob.await()?.let { peopleCount = it }
            rolesJob.await()?.let { rolesCount = it }
            val now = Instant.now()
            invitesJob.await()?.let { list ->
                pendingInvites = list.count { it.acceptedAt == null && (RoDate.parse(it.expiresAt)?.isAfter(now) ?: false) }
            }
            integrations = integrationsJob.await() ?: emptyList()
            changelogJob.await()?.let { release = it.entries.firstOrNull() }
            categoryGroups = categoriesJob.await() ?: emptyList()
            snapshotsJob.await()?.let { list -> snapshots = list.sortedByDescending { RoDate.parse(it.createdAt) } }
        }
    }

    fun makeDefault(location: LocationResponse) {
        if (settingDefault != null) return
        viewModelScope.launch {
            settingDefault = location.id
            runRefresh(onError = { message = ApiErrors.userMessage(it) }) {
                organizationRepository.setDefaultLocation(location.id)
                org = org?.copy(defaultLocationId = location.id)
                message = "${location.name} e acum locația implicită"
            }
            settingDefault = null
        }
    }

    fun uploadLogo(slot: LogoSlot, uri: Uri) {
        if (logoWorking != null) return
        viewModelScope.launch {
            logoWorking = slot
            runRefresh(onError = { message = ApiErrors.userMessage(it) }) {
                val (bytes, mime) = readImage(uri) ?: error("Nu am putut citi imaginea")
                org = organizationRepository.uploadLogo(bytes, mime, slot.variant)
                HoraeImages.logoRevision += 1
                message = "Logo-ul a fost încărcat"
            }
            logoWorking = null
        }
    }

    fun clearLogo(slot: LogoSlot) {
        if (logoWorking != null) return
        viewModelScope.launch {
            logoWorking = slot
            runRefresh(onError = { message = ApiErrors.userMessage(it) }) {
                org = organizationRepository.clearLogo(slot.variant)
                HoraeImages.logoRevision += 1
                message = "Logo-ul a fost șters"
            }
            logoWorking = null
        }
    }

    fun backupNow() {
        if (isBackingUp) return
        viewModelScope.launch {
            isBackingUp = true
            runRefresh(onError = { message = ApiErrors.userMessage(it) }) {
                val snapshot = organizationRepository.createSnapshot()
                snapshots = listOf(snapshot) + snapshots.orEmpty()
                message = "Starea a fost salvată"
            }
            isBackingUp = false
        }
    }

    /** PATCH /organization { wooDeliveryEnabled } (admin). */
    fun setWooDelivery(enabled: Boolean) {
        if (isSavingWooDelivery) return
        viewModelScope.launch {
            isSavingWooDelivery = true
            runRefresh(onError = { message = ApiErrors.userMessage(it) }) {
                org = organizationRepository.setWooDeliveryEnabled(enabled)
                message = if (enabled) "Livrările din magazin sunt active" else "Livrările din magazin sunt oprite"
            }
            isSavingWooDelivery = false
        }
    }

    fun saveCompany(body: UpdateCompanyRequest, onDone: () -> Unit) {
        if (isSavingCompany) return
        viewModelScope.launch {
            isSavingCompany = true
            runRefresh(onError = { message = ApiErrors.userMessage(it) }) {
                org = organizationRepository.updateCompany(body)
                message = "Datele firmei au fost salvate"
                onDone()
            }
            isSavingCompany = false
        }
    }

    /** Reads a picked image (photo picker URI) into memory with its MIME type. */
    private suspend fun readImage(uri: Uri): Pair<ByteArray, String>? = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val mime = resolver.getType(uri) ?: "image/jpeg"
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return@withContext null
        bytes to mime
    }
}
