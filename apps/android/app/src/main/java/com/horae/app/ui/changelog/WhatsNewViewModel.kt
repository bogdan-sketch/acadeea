package com.horae.app.ui.changelog

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.horae.app.BuildConfig
import com.horae.app.data.remote.dto.ChangelogEntryDto
import com.horae.app.data.repository.ChangelogRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * One-time "Ce e nou" popup after an update — staging (Horae Test) builds only,
 * same policy as iOS. Marks the version seen in SharedPreferences.
 */
@HiltViewModel
class WhatsNewViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: ChangelogRepository,
) : ViewModel() {

    private val prefs = context.getSharedPreferences("whats_new", Context.MODE_PRIVATE)

    private val _entry = MutableStateFlow<ChangelogEntryDto?>(null)
    val entry: StateFlow<ChangelogEntryDto?> = _entry.asStateFlow()

    init {
        if (BuildConfig.FLAVOR == "staging") {
            viewModelScope.launch {
                try {
                    val latest = repository.getChangelog().entries.firstOrNull() ?: return@launch
                    val lastSeen = prefs.getString("lastSeenVersion", null)
                    if (latest.version != lastSeen) _entry.value = latest
                } catch (e: Exception) {
                    Timber.w(e, "WhatsNew load failed")
                }
            }
        }
    }

    fun markSeen() {
        _entry.value?.let { prefs.edit().putString("lastSeenVersion", it.version).apply() }
        _entry.value = null
    }
}
