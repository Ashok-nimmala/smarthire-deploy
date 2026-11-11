package com.bnp.paribas.features.jobs

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bnp.paribas.core.ui.*
import com.bnp.paribas.core.utils.AppScope
import com.bnp.paribas.core.utils.Dates
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobsScreen(onOpenJob: (String) -> Unit, vm: JobsViewModel = viewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()

    // Refresh whenever the screen becomes active; never rely only on stale cache.
    OnLifecycle(onStart = { vm.refresh() })

    Column(Modifier.fillMaxSize()) {
        ScreenTitle("Find jobs", "Open positions at leading organisations.")
        Box(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
            AppTextField(
                value = ui.query,
                onValueChange = vm::onQueryChange,
                label = "Search jobs",
                imeAction = androidx.compose.ui.text.input.ImeAction.Search
            )
        }

        val searching = ui.query.trim().length >= 2

        PullToRefreshBox(
            isRefreshing = ui.refreshing,
            onRefresh = vm::refresh,
            modifier = Modifier.weight(1f)
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (ui.offline) item { OfflineBanner() }

                if (searching) {
                    when {
                        ui.searching || ui.results == null -> item {
                            Text("Searching...", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted,
                                modifier = Modifier.padding(vertical = 16.dp))
                        }
                        ui.results!!.isEmpty() -> item {
                            EmptyState("No jobs found", "Try a different keyword.")
                        }
                        else -> items(ui.results!!, key = { it.jdId }) { job ->
                            JobCard(job, onClick = { onOpenJob(job.jdId) })
                        }
                    }
                } else {
                    when {
                        ui.jobs.isNotEmpty() -> items(ui.jobs, key = { it.jdId }) { job ->
                            JobCard(job, onClick = { onOpenJob(job.jdId) })
                        }
                        !ui.loaded || ui.refreshing -> items(4) { SkeletonCard() }
                        ui.error != null -> item { ErrorState(ui.error!!, onRetry = vm::refresh) }
                        ui.offline -> item {
                            ErrorState("Internet connection required.", onRetry = vm::refresh, title = "You're offline")
                        }
                        else -> item { EmptyState("No jobs available", "Check again later.") }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobDetailsScreen(
    onBack: () -> Unit,
    onApplied: (appId: String) -> Unit,
    vm: JobDetailsViewModel = viewModel()
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(ui.appliedAppId) {
        val id = ui.appliedAppId
        if (id != null) {
            vm.consumeApplied()
            AppScope.launch { snackbar.showSnackbar("Application submitted") }
            onApplied(id)
        }
    }
    LaunchedEffect(ui.applyError) {
        val m = ui.applyError
        if (m != null) {
            vm.clearApplyError()
            scope.launch { snackbar.showSnackbar(m) }
        }
    }

    if (ui.showConfirm) {
        AlertDialog(
            onDismissRequest = vm::dismissConfirm,
            title = { Text("Apply for this position?") },
            text = { Text("Your current resume will be used for screening.") },
            confirmButton = {
                TextButton(onClick = vm::confirmApply) { Text("Apply", color = Brand.Primary) }
            },
            dismissButton = {
                TextButton(onClick = vm::dismissConfirm) { Text("Cancel", color = Brand.Muted) }
            },
            containerColor = androidx.compose.ui.graphics.Color.White
        )
    }

    Column(Modifier.fillMaxSize()) {
        BackHeader("Job details", onBack)

        val job = ui.job
        PullToRefreshBox(
            isRefreshing = ui.refreshing,
            onRefresh = vm::refresh,
            modifier = Modifier.weight(1f)
        ) {
            when {
                job == null && (!ui.loaded || ui.refreshing) -> SkeletonList(2)
                job == null && ui.offline -> ErrorState("Internet connection required.", onRetry = vm::refresh, title = "You're offline")
                job == null -> ErrorState(ui.error ?: "We couldn't load this job.", onRetry = vm::refresh)
                else -> Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp, vertical = 8.dp)
                ) {
                    if (ui.offline) {
                        OfflineBanner()
                        Spacer(Modifier.height(12.dp))
                    }
                    Text(job.title, style = MaterialTheme.typography.headlineSmall, color = Brand.Ink)
                    if (job.org.isNotBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text(job.org, style = MaterialTheme.typography.bodyLarge, color = Brand.Muted)
                    }
                    Spacer(Modifier.height(16.dp))

                    AppCard {
                        val posted = Dates.full(job.postedAt)
                        val expires = Dates.full(job.expiresAt)
                        if (posted != null) InfoRow("Posted", posted)
                        if (posted != null && expires != null) Hairline()
                        if (expires != null) InfoRow("Expires", expires)
                        if (posted == null && expires == null) {
                            Text("Open position", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                        }
                    }

                    if (job.description.isNotBlank()) {
                        Spacer(Modifier.height(20.dp))
                        Text("About the role", style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
                        Spacer(Modifier.height(8.dp))
                        Text(job.description, style = MaterialTheme.typography.bodyLarge, color = Brand.Ink)
                    }

                    if (job.questionCount != null || job.totalMarks != null) {
                        Spacer(Modifier.height(20.dp))
                        AppCard {
                            Text("Assessment", style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
                            Spacer(Modifier.height(4.dp))
                            val parts = listOfNotNull(
                                job.questionCount?.let { "$it questions" },
                                job.totalMarks?.let { "$it marks" }
                            )
                            Text(parts.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                        }
                    }

                    val org = ui.org
                    if (org != null && (org.name.isNotBlank() || !org.description.isNullOrBlank())) {
                        Spacer(Modifier.height(20.dp))
                        Text("About the organisation", style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
                        Spacer(Modifier.height(8.dp))
                        if (org.name.isNotBlank()) {
                            Text(org.name, style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
                        }
                        if (!org.description.isNullOrBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(org.description, style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                        }
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }

        if (job != null) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                PrimaryButton("Apply Now", onClick = vm::requestApply, loading = ui.applying)
            }
        }
    }
}
