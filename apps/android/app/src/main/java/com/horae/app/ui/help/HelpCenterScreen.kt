package com.horae.app.ui.help

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.horae.app.data.remote.dto.TutorialFlowDto
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.tutorial.rememberTutorialCenter

/**
 * "Centru de ajutor" — LazyColumn of flows grouped by category, searchable by title/body, each
 * expandable to a read-along step list plus a "Pornește turul" button that hands off to
 * [com.horae.app.ui.tutorial.TutorialOverlay] for a live walkthrough. Reachable only while the
 * signed-in user's own per-user "Tutorial" preference is on (gated by the caller — see
 * Profil › Date › Unelte).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HelpCenterScreen(onBack: () -> Unit) {
    val center = rememberTutorialCenter()
    val flows by center.flows.collectAsState()
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        center.ensureContentLoaded()
        loading = false
    }

    var query by rememberSaveable { mutableStateOf("") }
    val filtered = remember(flows, query) {
        if (query.isBlank()) {
            flows
        } else {
            val q = query.trim()
            flows.mapNotNull { flow ->
                val steps = flow.steps.filter {
                    it.title.contains(q, ignoreCase = true) || it.body.contains(q, ignoreCase = true)
                }
                when {
                    flow.title.contains(q, ignoreCase = true) -> flow
                    steps.isNotEmpty() -> flow.copy(steps = steps)
                    else -> null
                }
            }
        }
    }
    val grouped = remember(filtered) { filtered.groupBy { it.category } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Centru de ajutor") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Înapoi")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        Column(modifier = Modifier.fillMaxSize().padding(pad)) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Caută în ghiduri...") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            )

            if (loading && flows.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                return@Scaffold
            }

            LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                grouped.forEach { (category, categoryFlows) ->
                    item(key = "header-$category") {
                        Text(
                            category,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    items(categoryFlows, key = { it.id }) { flow ->
                        FlowCard(
                            flow = flow,
                            onStartTour = { center.start(flow.id) },
                        )
                    }
                }
                if (grouped.isEmpty()) {
                    item {
                        Text(
                            "Niciun rezultat pentru „$query”.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 24.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FlowCard(flow: TutorialFlowDto, onStartTour: () -> Unit) {
    var expanded by rememberSaveable(flow.id) { mutableStateOf(false) }

    HoraeCard(modifier = Modifier.fillMaxWidth().animateContentSize()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(
                        indication = null,
                        interactionSource = remember { MutableInteractionSource() },
                        onClick = { expanded = !expanded },
                    ),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    flow.title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (expanded) {
                flow.steps.forEachIndexed { i, step ->
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            "${i + 1}. ${step.title}",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            step.body,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                TextButton(onClick = onStartTour, modifier = Modifier.fillMaxWidth()) {
                    Text("Pornește turul")
                }
            }
        }
    }
}
