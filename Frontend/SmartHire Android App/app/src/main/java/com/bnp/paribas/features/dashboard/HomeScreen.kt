package com.bnp.paribas.features.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bnp.paribas.core.ui.*
import com.bnp.paribas.data.models.Dashboard
import com.bnp.paribas.features.applications.ApplicationCard
import com.bnp.paribas.features.applications.statusText
import com.bnp.paribas.features.jobs.JobCard
import java.time.LocalTime

private fun greeting(): String {
    val h = LocalTime.now().hour
    return when {
        h < 12 -> "Good morning"
        h < 17 -> "Good afternoon"
        else -> "Good evening"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpenJob: (String) -> Unit,
    onOpenApplication: (String) -> Unit,
    onWriteExam: (examId: String) -> Unit,
    onFindJobs: () -> Unit,
    onSeeAllApplications: () -> Unit,
    vm: DashboardViewModel = viewModel()
) {
    val ui by vm.ui.collectAsStateWithLifecycle()

    // Refresh when Home becomes visible + every 60 s while it stays visible. Stops in the background.
    OnLifecycle(onStart = { vm.startAutoRefresh() }, onStop = { vm.stopAutoRefresh() })

    PullToRefreshBox(
        isRefreshing = ui.refreshing,
        onRefresh = vm::pullRefresh,
        modifier = Modifier.fillMaxSize()
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                val name = ui.dashboard?.name?.takeIf { it.isNotBlank() } ?: ui.sessionName
                val first = name.trim().substringBefore(' ')
                Column {
                    Text(
                        if (first.isNotEmpty()) "${greeting()}, $first" else greeting(),
                        style = MaterialTheme.typography.headlineMedium,
                        color = Brand.Ink
                    )
                    Spacer(Modifier.height(4.dp))
                    Text("Find your next opportunity.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                }
            }

            if (ui.offline) item { OfflineBanner() }

            val d = ui.dashboard
            when {
                d == null && (!ui.loaded || ui.refreshing) -> {
                    item { StatsSkeleton() }
                    items(3) { SkeletonCard() }
                }
                d == null -> item {
                    if (ui.offline) ErrorState("Internet connection required.", onRetry = vm::pullRefresh, title = "You're offline")
                    else ErrorState(ui.error ?: "We couldn't load your dashboard.", onRetry = vm::pullRefresh)
                }
                else -> dashboardContent(d, onOpenJob, onOpenApplication, onWriteExam, onFindJobs, onSeeAllApplications)
            }

            if (d != null && ui.error != null) {
                item { Text(ui.error!!, style = MaterialTheme.typography.bodySmall, color = Brand.Muted) }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.dashboardContent(
    d: Dashboard,
    onOpenJob: (String) -> Unit,
    onOpenApplication: (String) -> Unit,
    onWriteExam: (String) -> Unit,
    onFindJobs: () -> Unit,
    onSeeAllApplications: () -> Unit
) {
    item {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatTile("Applications", d.count("applications", "total", "total_applications"), Modifier.weight(1f))
            StatTile("In progress", d.count("in_progress", "active", "screening"), Modifier.weight(1f))
            StatTile("Exams", d.count("exams", "exam", "exams_pending"), Modifier.weight(1f))
            StatTile("Accepted", d.count("accepted"), Modifier.weight(1f))
        }
    }

    val next = d.nextStep
    if (next != null && next.examId != null) {
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Brand.PrimarySoft)
                    .padding(16.dp)
            ) {
                Text("YOUR NEXT STEP", style = MaterialTheme.typography.labelSmall, color = Brand.PrimaryDark)
                Spacer(Modifier.height(8.dp))
                Text(next.title, style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
                if (next.org.isNotBlank()) {
                    Text(next.org, style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                }
                Spacer(Modifier.height(8.dp))
                Text(statusText(next), style = MaterialTheme.typography.bodyMedium, color = Brand.Ink)
                Spacer(Modifier.height(14.dp))
                PrimaryButton(
                    if (next.status == "EXAM_IN_PROGRESS") "Resume Exam" else "Write Exam",
                    onClick = { onWriteExam(next.examId) }
                )
            }
        }
    }

    item {
        SectionTitle("Recent applications", action = if (d.recentApplications.isNotEmpty()) "See all" else null, onAction = onSeeAllApplications)
    }
    if (d.recentApplications.isEmpty()) {
        item {
            AppCard {
                Text("No applications yet", style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
                Spacer(Modifier.height(4.dp))
                Text("Explore open positions and apply to your next opportunity.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                Spacer(Modifier.height(12.dp))
                SecondaryButton("Find Jobs", onFindJobs)
            }
        }
    } else {
        items(d.recentApplications.take(3), key = { it.appId }) { app ->
            ApplicationCard(app, onClick = { onOpenApplication(app.appId) }, showDateRelative = true)
        }
    }

    if (d.recommendedJobs.isNotEmpty()) {
        item { SectionTitle("Recommended for you") }
        items(d.recommendedJobs.take(5), key = { "rec_" + it.jdId }) { job ->
            JobCard(job, onClick = { onOpenJob(job.jdId) }, compact = true)
        }
    }
}

@Composable
private fun StatTile(label: String, value: Int?, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = Brand.Surface,
        border = BorderStroke(1.dp, Brand.Border)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp, horizontal = 4.dp),
            horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally
        ) {
            Text(value?.toString() ?: "—", style = MaterialTheme.typography.titleLarge, color = Brand.Ink)
            Spacer(Modifier.height(2.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = Brand.Muted, textAlign = TextAlign.Center, maxLines = 1)
        }
    }
}

@Composable
private fun StatsSkeleton() {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(4) { Skeleton(Modifier.weight(1f), 64.dp) }
    }
}
