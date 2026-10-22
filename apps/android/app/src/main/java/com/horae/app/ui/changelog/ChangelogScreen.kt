package com.horae.app.ui.changelog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.horae.app.data.remote.dto.ChangelogEntryDto
import com.horae.app.data.remote.dto.ChangelogItemDto

/** Full curated changelog — every version, like the web /changelog page. */
@Composable
fun ChangelogScreen(
    viewModel: ChangelogViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    when {
        state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        state.entries.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Nu am putut încărca noutățile", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        else -> LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(state.entries, key = { it.version }) { entry ->
                ChangelogEntryCard(entry)
            }
        }
    }
}

@Composable
private fun ChangelogEntryCard(entry: ChangelogEntryDto) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(
                "v${entry.version} — ${entry.title}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                com.horae.app.ui.common.RoDate.shortDate(entry.date),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            ItemGroup("Nou", entry.nou)
            ItemGroup("Imbunatatiri", entry.imbunatatiri)
            ItemGroup("Reparat", entry.reparat)
        }
    }
}

@Composable
private fun ItemGroup(title: String, items: List<ChangelogItemDto>) {
    if (items.isEmpty()) return
    Spacer(Modifier.height(10.dp))
    Text(
        title,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
    )
    items.forEach { item ->
        Spacer(Modifier.height(4.dp))
        Text("• ${item.text}", style = MaterialTheme.typography.bodySmall)
    }
}
